const express = require('express');
const cors = require('cors');
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Pool } = require('pg');
const usePostgresAuthState = require('./pgAuth');

const app = express();
app.use(cors());
app.use(express.json());

// Set up PostgreSQL Pool
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost/clinic';
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false }
});

let sock;
let currentPairingCode = '';
let isConnected = false;
let isInitializing = false;

async function connectToWhatsApp() {
    if (isInitializing) {
        console.log('[WhatsApp System] connectToWhatsApp called but already initializing. Skipping.');
        return;
    }
    
    isInitializing = true;
    
    // Ensure previous socket is fully destroyed to prevent zombie instances
    if (sock) {
        console.log('[WhatsApp System] Cleaning up previous socket instance before reconnect...');
        try {
            sock.end(undefined);
        } catch (e) {
            // ignore cleanup errors
        }
    }
    
    try {
        const { state, saveCreds } = await usePostgresAuthState(pool);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`[WhatsApp System] Using WA v${version.join('.')}, isLatest: ${isLatest}`);
        
        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }), // suppress logs to keep QR clean
            // Use a standard browser signature; custom ones often get blocked by WhatsApp's anti-spam, causing the "check your connection" error on the phone.
            browser: ['Mac OS', 'Safari', '10.15.7'],
            // Keep-alive helps prevent Render from dropping idle WebSockets during pairing
            keepAliveIntervalMs: 10000,
            connectTimeoutMs: 60000
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log('[WhatsApp Event] connection.update:', {
                connection: connection || 'connecting',
                lastDisconnectError: lastDisconnect?.error?.message || 'none',
                statusCode: lastDisconnect?.error?.output?.statusCode || 'none',
                hasQR: !!qr
            });
            
            if (qr) {
                currentQR = qr;
                console.log('[WhatsApp Event] New QR code generated. Waiting for scan...');
            }
            
            if (connection === 'close') {
                isConnected = false;
                isInitializing = false; // Reset lock so we can reconnect
                const statusCode = lastDisconnect.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`[WhatsApp Event] Connection closed. StatusCode: ${statusCode}. Reconnecting: ${shouldReconnect}`);
                
                // If the session is totally invalid (401) or we are intentionally logged out, clear DB state
                if (statusCode === 401 || statusCode === DisconnectReason.loggedOut) {
                    console.log('[WhatsApp Event] Authentication invalid or logged out. Wiping credentials from DB for fresh pair...');
                    pool.query('DELETE FROM whatsapp_auth_keys').catch(console.error);
                    currentPairingCode = '';
                }

                // reconnect if not logged out
                if (shouldReconnect) {
                    setTimeout(connectToWhatsApp, 2000);
                }
            } else if (connection === 'open') {
                isConnected = true;
                isInitializing = false; // Reset lock
                currentPairingCode = '';
                console.log('[WhatsApp Event] Authenticated and connection opened successfully!');
            }
        });

        sock.ev.on('creds.update', (creds) => {
            console.log('[WhatsApp Event] Credentials updated and saved to DB');
            saveCreds(creds);
        });
    } catch (error) {
        console.error('[WhatsApp System] Critical error during connection initialization:', error);
        isConnected = false;
        isInitializing = false;
    }
}

// Start WhatsApp connection
connectToWhatsApp();

app.get('/api/whatsapp/status', async (req, res) => {
    let connectedNumber = null;
    if (isConnected && sock && sock.user) {
        // sock.user.id is in format: 972506804294:12@s.whatsapp.net
        connectedNumber = sock.user.id.split(':')[0].split('@')[0];
    }

    if (isConnected) {
        return res.json({ status: 'connected', phoneNumber: connectedNumber });
    }
    if (currentPairingCode) {
        return res.json({ status: 'pairing_ready' });
    }
    return res.json({ status: 'disconnected' });
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
    try {
        if (sock) {
            sock.logout();
            sock.end(undefined);
        }
        await pool.query('DELETE FROM whatsapp_auth_keys');
        isConnected = false;
        currentPairingCode = '';
        
        // Re-initialize socket so a new pairing can be requested immediately
        setTimeout(connectToWhatsApp, 1000);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to disconnect:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/whatsapp/pair', async (req, res) => {
    try {
        if (isConnected) {
            return res.status(400).json({ error: 'Already connected' });
        }
        
        let { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ error: 'Missing phone number' });
        
        // Clean phone number
        phoneNumber = phoneNumber.toString().replace(/[^0-9]/g, '');
        
        // Handle Israeli prefixes
        if (phoneNumber.startsWith('0') && phoneNumber.length === 10) {
            phoneNumber = '972' + phoneNumber.substring(1);
        } else if (!phoneNumber.startsWith('972') && phoneNumber.length >= 10) {
            // Just pass it as is for other countries
        }

        if (!sock) {
            return res.status(500).json({ error: 'WhatsApp socket not initialized' });
        }
        
        // Wait briefly if it's currently connecting
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`[WhatsApp System] Pairing code generated: ${code}`);
        currentPairingCode = code;
        
        res.json({ code });
    } catch (error) {
        console.error('Failed to request pairing code:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/send-message', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        
        if (!phoneNumber || !message) {
            return res.status(400).json({ error: 'Missing phoneNumber or message' });
        }

        if (!sock || !isConnected) {
            return res.status(500).json({ error: 'WhatsApp socket not initialized or not connected' });
        }

        // Convert the incoming phoneNumber to JID format
        // Ensure the phone number doesn't have any non-numeric characters
        const cleanNumber = phoneNumber.toString().replace(/[^0-9]/g, '');
        let jid = `${cleanNumber}@s.whatsapp.net`;
        
        console.log(`Checking if ${jid} exists on WhatsApp...`);
        
        // Verify the number exists on WhatsApp first
        const [result] = await sock.onWhatsApp(jid);
        if (!result || !result.exists) {
            console.log(`${jid} is not a valid WhatsApp number`);
            return res.status(400).json({ error: `Phone number ${cleanNumber} is not registered on WhatsApp` });
        }
        
        // Use the actual JID returned by WhatsApp (sometimes it differs slightly)
        jid = result.jid || jid;

        console.log(`Sending message to ${jid}...`);
        
        const sendResult = await sock.sendMessage(jid, { text: message });
        console.log(`Message sent successfully to ${jid}`);
        res.status(200).json({ success: true, result: sendResult });
    } catch (error) {
        console.error('Failed to send message:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`WhatsApp microservice listening on port ${PORT}`);
});

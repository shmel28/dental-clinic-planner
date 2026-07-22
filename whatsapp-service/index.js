const express = require('express');
const cors = require('cors');
const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
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
let currentQR = '';
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
    const { state, saveCreds } = await usePostgresAuthState(pool);
    
    sock = makeWASocket({
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
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[WhatsApp Event] Connection closed. Reconnecting:', shouldReconnect);
            // reconnect if not logged out
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 2000);
            } else {
                console.log('[WhatsApp Event] Logged out. Clearing credentials from DB...');
                pool.query('DELETE FROM whatsapp_auth_keys').catch(console.error);
                currentQR = '';
            }
        } else if (connection === 'open') {
            isConnected = true;
            isInitializing = false; // Reset lock
            currentQR = '';
            console.log('[WhatsApp Event] Authenticated and connection opened successfully!');
        }
    });

    sock.ev.on('creds.update', (creds) => {
        console.log('[WhatsApp Event] Credentials updated and saved to DB');
        saveCreds(creds);
    });
}

// Start WhatsApp connection
connectToWhatsApp();

app.get('/api/whatsapp/qr', async (req, res) => {
    if (isConnected) {
        return res.json({ status: 'connected', qr: null });
    }
    if (currentQR) {
        return res.json({ status: 'qr_ready', qr: currentQR });
    }
    // If neither connected nor qr, might be initializing
    return res.json({ status: 'initializing', qr: null });
});

app.post('/send-message', async (req, res) => {
    try {
        const { phoneNumber, message } = req.body;
        
        if (!phoneNumber || !message) {
            return res.status(400).json({ error: 'Missing phoneNumber or message' });
        }

        // Convert the incoming phoneNumber to JID format
        const jid = `${phoneNumber}@s.whatsapp.net`;
        
        console.log(`Sending message to ${jid}...`);
        
        const result = await sock.sendMessage(jid, { text: message });
        console.log(`Message sent successfully to ${jid}`);
        res.status(200).json({ success: true, result });
    } catch (error) {
        console.error('Failed to send message:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`WhatsApp microservice listening on port ${PORT}`);
});

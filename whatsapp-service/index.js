const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

let sock;
let currentQR = '';

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) // suppress logs to keep QR clean
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = qr;
            console.log('New QR code received. View it at http://localhost:3000/qr');
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed due to ', lastDisconnect.error?.message, ', reconnecting ', shouldReconnect);
            // reconnect if not logged out
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            currentQR = '';
            console.log('WhatsApp connection opened successfully!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Start WhatsApp connection
connectToWhatsApp();

app.get('/qr', async (req, res) => {
    if (currentQR) {
        try {
            const qrImage = await qrcode.toDataURL(currentQR);
            res.send(`
                <html>
                    <body style="display:flex; justify-content:center; align-items:center; height:100vh; background-color:#f0f0f0;">
                        <div style="text-align:center; background:white; padding:20px; border-radius:10px; box-shadow:0 4px 8px rgba(0,0,0,0.1);">
                            <h2>Scan WhatsApp QR Code</h2>
                            <img src="${qrImage}" style="width:300px; height:300px;" />
                            <p>This page needs to be manually refreshed for new QR codes.</p>
                        </div>
                    </body>
                </html>
            `);
        } catch (err) {
            res.status(500).send('Error generating QR code');
        }
    } else {
        res.send('<h2>Already connected or waiting for QR</h2>');
    }
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

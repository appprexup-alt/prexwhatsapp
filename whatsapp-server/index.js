import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidNormalizedUser
} from '@whiskeysockets/baileys';
import { createClient } from '@supabase/supabase-js';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ORG_ID = process.env.ORG_ID || '00000000-0000-0000-0000-000000000000';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const logger = pino({ level: 'silent' }); // Silent pino to avoid clutter

async function connectToWhatsApp() {
    console.log('[Auth] Starting WhatsApp connection for Org:', ORG_ID);

    const authPath = path.resolve('./auth');
    if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`[Baileys] Using v${version.join('.')}, latest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger,
        auth: state,
        printQRInTerminal: true, // Keep this for terminal debugging
        generateHighQualityQR: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        browser: ['CRM Inmobiliario', 'Chrome', '1.0.0']
    });

    // --- HELPER: Save Message to Supabase ---
    const saveMessage = async (msg) => {
        try {
            if (!msg.message) return;
            const from = msg.key.remoteJid;
            if (!from || from === 'status@broadcast' || from.includes('@g.us')) return;

            const isMe = msg.key.fromMe;
            const phone = from.split('@')[0].replace(/\D/g, '');

            // Extract message content and media info
            let content = '';
            let mediaType = 'text';
            let mediaUrl = null;
            let mediaFilename = null;

            if (msg.message?.conversation) {
                content = msg.message.conversation;
                mediaType = 'text';
            } else if (msg.message?.extendedTextMessage?.text) {
                content = msg.message.extendedTextMessage.text;
                mediaType = 'text';
            } else if (msg.message?.imageMessage) {
                content = msg.message.imageMessage.caption || '';
                mediaType = 'image';
                // For received images, we store the message key for later download
                // The actual URL would need to be downloaded from WhatsApp servers
            } else if (msg.message?.videoMessage) {
                content = msg.message.videoMessage.caption || '';
                mediaType = 'video';
            } else if (msg.message?.audioMessage) {
                content = '';
                mediaType = 'audio';
            } else if (msg.message?.documentMessage) {
                content = msg.message.documentMessage.caption || '';
                mediaType = 'document';
                mediaFilename = msg.message.documentMessage.fileName || 'documento';
            } else if (msg.message?.stickerMessage) {
                content = '[Sticker]';
                mediaType = 'image';
            } else {
                // Unknown message type, skip
                return;
            }

            console.log(`[Sync] Message from ${phone}. Type: ${mediaType}, Content: ${content.substring(0, 30)}`);

            // 1. Find lead specific to THIS organization
            const { data: leadCandidates } = await supabase
                .from('leads')
                .select('id, phone')
                .eq('organization_id', ORG_ID);

            const lead = leadCandidates?.find(l => {
                const lPhone = l.phone.replace(/\D/g, '');
                return lPhone.endsWith(phone) || phone.endsWith(lPhone);
            });

            let leadId;
            if (!lead) {
                if (isMe) return;

                console.log(`[Sync] Creating new lead for ${phone}`);
                const { data: newLead, error: leadError } = await supabase.from('leads').insert([{
                    organization_id: ORG_ID,
                    name: msg.pushName || phone,
                    phone: phone,
                    status: 'Nuevo',
                    source: 'WhatsApp',
                    last_contact: new Date().toISOString()
                }]).select().single();

                if (leadError) throw leadError;
                leadId = newLead.id;
            } else {
                leadId = lead.id;
                await supabase.from('leads').update({ last_contact: new Date().toISOString() }).eq('id', leadId);
            }

            // 2. Save Message with media fields
            const { error: insertError } = await supabase.from('messages').insert([{
                organization_id: ORG_ID,
                lead_id: leadId,
                content: content || (mediaType !== 'text' ? `[${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}]` : ''),
                sender: isMe ? 'agent' : 'client',
                created_at: new Date(msg.messageTimestamp * 1000).toISOString(),
                media_type: mediaType,
                media_url: mediaUrl,
                media_filename: mediaFilename,
                payload: msg.message
            }]);

            if (insertError) {
                console.error('[Sync] Insert error:', insertError.message);
            } else {
                console.log(`[Sync] Message saved successfully for lead ${leadId}`);
            }

        } catch (err) {
            console.error('[Sync Error]', err.message);
        }
    };

    // Handle Connection Updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('[QR] New code generated. Updating Supabase...');
            const { error } = await supabase.from('whatsapp_config')
                .upsert({
                    organization_id: ORG_ID,
                    status: 'qr',
                    qr_code: qr,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'organization_id' });
            if (error) console.error('[QR Error]', error.message);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorReason = lastDisconnect?.error?.message;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[Conn] Closed. Status: ${statusCode}, Reason: ${errorReason}. Reconnecting: ${shouldReconnect}`);

            await supabase.from('whatsapp_config')
                .update({ status: 'disconnected', qr_code: null })
                .eq('organization_id', ORG_ID);

            if (shouldReconnect) {
                console.log('[Conn] Retrying in 5s...');
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('[Conn] Logged out or fatal error. Clean restart required.');
            }
        } else if (connection === 'open') {
            console.log('[Conn] CONNECTED successfully');
            await supabase.from('whatsapp_config')
                .update({
                    status: 'connected',
                    qr_code: null,
                    phone_number: sock.user?.id
                })
                .eq('organization_id', ORG_ID);
        }
    });

    sock.ev.on('creds.update', () => {
        console.log('[Auth] Credentials updated');
        saveCreds();
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify') {
            for (const msg of m.messages) {
                await saveMessage(msg);
            }
        }
    });

    // Handle Outgoing Messages
    setInterval(async () => {
        const { data: pendingMessages } = await supabase
            .from('messages')
            .select('*')
            .eq('organization_id', ORG_ID)
            .eq('sender', 'agent')
            .eq('topic', 'pending_wa')
            .limit(5);

        if (pendingMessages?.length) {
            for (const msg of pendingMessages) {
                try {
                    const { data: lead } = await supabase.from('leads').select('phone').eq('id', msg.lead_id).single();
                    if (lead) {
                        const cleanPhone = lead.phone.replace(/\D/g, '');
                        await sock.sendMessage(`${cleanPhone}@s.whatsapp.net`, { text: msg.content });
                        await supabase.from('messages').update({ topic: 'sent_wa' }).eq('id', msg.id);
                        console.log(`[Sent] to ${cleanPhone}`);
                    }
                } catch (e) {
                    console.error('[Send Error]', e.message);
                }
            }
        }
    }, 5000);
}

connectToWhatsApp().catch(err => console.error('[Fatal Error]', err));

process.on('uncaughtException', err => console.error('[Process Error]', err));
process.on('unhandledRejection', reason => console.error('[Promise Error]', reason));

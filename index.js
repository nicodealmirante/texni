import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } from '@whiskeysockets/baileys'
import fs from 'fs'
import pino from 'pino'
import dotenv from 'dotenv'

dotenv.config()

const { ORIGIN_ID, DEST_ID, SESSION_PATH } = process.env

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH || './session')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' })
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.remoteJid !== ORIGIN_ID) return

    const type = Object.keys(msg.message)[0]
    if (type !== 'imageMessage') return

    const caption = msg.message.imageMessage.caption || ''
    if (!caption.trim()) return

    const newCaption = caption.replace(/\$?\s?([0-9]+(?:\.[0-9]+)?)/g, (m, p1) => {
      const num = parseFloat(p1)
      if (isNaN(num)) return m
      const newVal = Math.round(num * 1.15)
      return m.replace(p1, newVal)
    })

    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage })
      await sock.sendMessage(DEST_ID, { image: buffer, caption: newCaption })
      console.log(`✅ Imagen reenviada con texto modificado → ${DEST_ID}`)
    } catch (err) {
      console.error('❌ Error al reenviar:', err)
    }
  })

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode
      if (reason !== DisconnectReason.loggedOut) startBot()
    } else if (connection === 'open') {
      console.log('🟢 Bot conectado correctamente')
    }
  })
}

startBot()
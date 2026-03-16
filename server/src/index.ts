import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { hocuspocus } from './hocuspocus.js'
import { compileTypst, getAssetsDir } from './compiler.js'
import { listDocs, isRoomProtected, setRoomPassword, checkRoomPassword, deleteRoom } from './storage.js'
import { join } from 'path'
import { existsSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs'

const PORT = Number(process.env.PORT ?? 3000)
const CLIENT_DIST = join(__dirname, '..', '..', 'client', 'dist')

// ── Express ────────────────────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/docs', (_req, res) => {
  const docs = listDocs().map(name => ({ name, protected: isRoomProtected(name) }))
  res.json({ docs })
})

// ── Room auth ─────────────────────────────────────────────────────────────────

app.get('/api/rooms/:docId/auth', (req, res) => {
  res.json({ protected: isRoomProtected(req.params.docId) })
})

app.post('/api/rooms/:docId/auth', (req, res) => {
  const { password = '', action = 'validate' } = req.body as { password?: string; action?: string }
  const docId = req.params.docId

  if (action === 'set') {
    if (isRoomProtected(docId)) return res.status(409).json({ ok: false, error: 'Room already has a password' })
    if (!password.trim()) return res.status(400).json({ ok: false, error: 'Password cannot be empty' })
    setRoomPassword(docId, password)
    return res.json({ ok: true })
  }

  const ok = checkRoomPassword(docId, password)
  res.json({ ok, error: ok ? undefined : 'Incorrect password' })
})

app.delete('/api/rooms/:docId', (req, res) => {
  const { password = '' } = req.body as { password?: string }
  const docId = req.params.docId
  if (!checkRoomPassword(docId, password)) {
    return res.status(403).json({ ok: false, error: 'Incorrect password' })
  }
  deleteRoom(docId)
  res.json({ ok: true })
})

// ── Assets ────────────────────────────────────────────────────────────────

const ASSET_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf', '.webp'])
const RESERVED   = new Set(['_compile.typ', '_compile.pdf'])

app.get('/api/rooms/:docId/assets', (req, res) => {
  const dir = getAssetsDir(req.params.docId)
  const files = readdirSync(dir)
    .filter(f => {
      const ext = f.slice(f.lastIndexOf('.')).toLowerCase()
      return ASSET_EXTS.has(ext) && !RESERVED.has(f)
    })
    .map(f => ({ name: f, size: statSync(join(dir, f)).size }))
  res.json({ files })
})

app.post('/api/rooms/:docId/assets', (req, res) => {
  const { filename, data } = req.body as { filename?: string; data?: string }
  if (!filename || !data) return res.status(400).json({ ok: false, error: 'filename and data required' })
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  if (!ASSET_EXTS.has(ext)) return res.status(400).json({ ok: false, error: 'unsupported file type' })
  // Sanitise: strip path separators
  const safe = filename.replace(/[/\\]/g, '_')
  const dir  = getAssetsDir(req.params.docId)
  writeFileSync(join(dir, safe), Buffer.from(data, 'base64'))
  res.json({ ok: true, name: safe })
})

app.delete('/api/rooms/:docId/assets/:filename', (req, res) => {
  const dir  = getAssetsDir(req.params.docId)
  const file = req.params.filename.replace(/[/\\]/g, '_')
  const path = join(dir, file)
  if (existsSync(path)) unlinkSync(path)
  res.json({ ok: true })
})

// ── Compile ───────────────────────────────────────────────────────────────

app.post('/api/compile', async (req, res) => {
  const { content, docId } = req.body as { content?: string; docId?: string }
  if (typeof content !== 'string') {
    return res.status(400).json({ ok: false, error: 'content required' })
  }
  const result = await compileTypst(content, docId ?? 'untitled')
  res.json(result)
})

// ── Serve built client (MUST be after all API routes) ─────────────────────
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST))
  app.get('*', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')))
}

// ── HTTP + WebSocket server ────────────────────────────────────────────────
const httpServer = createServer(app)

// WebSocket server for Hocuspocus (Y.js collaboration)
const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws, req) => {
  hocuspocus.handleConnection(ws as any, req)
})

httpServer.on('upgrade', (request, socket, head) => {
  if (request.url?.startsWith('/ws')) {
    wss.handleUpgrade(request, socket as any, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  } else {
    socket.destroy()
  }
})

httpServer.listen(PORT, () => {
  console.log(`\n  Glyph Quorum server running`)
  console.log(`  ➜  HTTP  http://localhost:${PORT}`)
  console.log(`  ➜  WS    ws://localhost:${PORT}/ws\n`)
})

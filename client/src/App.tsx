import React, { useState, useRef, useCallback } from 'react'
import { Toolbar } from './components/Toolbar'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { Sidebar } from './components/Sidebar'
import { useCollab } from './hooks/useCollab'
import { useCompiler } from './hooks/useCompiler'
import { useAssets } from './hooks/useAssets'
import type { editor as MonacoEditor } from 'monaco-editor'

const COLORS = ['#0066CC','#2E7D32','#C62828','#E65100','#6A1B9A','#00838F','#AD1457','#558B2F']

function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)] }

// ── Join Screen ──────────────────────────────────────────────────────────────

interface RoomInfo { name: string; protected: boolean }

function JoinScreen({ onJoin }: { onJoin: (room: string, name: string, color: string, password: string) => void }) {
  const [room,      setRoom]      = useState('')
  const [name,      setName]      = useState(() => localStorage.getItem('quorum-name') ?? '')
  const [color,     setColor]     = useState(() => localStorage.getItem('quorum-color') ?? randomColor())
  const [password,  setPassword]  = useState('')
  const [authError, setAuthError] = useState('')
  const [checking,  setChecking]  = useState(false)
  const [rooms,     setRooms]     = useState<RoomInfo[]>([])

  React.useEffect(() => {
    fetch('/api/docs')
      .then(r => r.json())
      .then(d => setRooms(d.docs ?? []))
      .catch(() => {})
  }, [])

  const submit = async () => {
    const r = room.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') || 'untitled'
    const n = name.trim() || 'Anonymous'
    setAuthError('')
    setChecking(true)

    try {
      const authRes = await fetch(`/api/rooms/${r}/auth`)
      const { protected: isProtected } = await authRes.json() as { protected: boolean }

      if (isProtected) {
        if (!password) {
          setAuthError('This room is password protected — enter the password to join.')
          setChecking(false)
          return
        }
        const validateRes = await fetch(`/api/rooms/${r}/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, action: 'validate' }),
        })
        const { ok, error } = await validateRes.json() as { ok: boolean; error?: string }
        if (!ok) {
          setAuthError(error ?? 'Incorrect password')
          setChecking(false)
          return
        }
      } else if (password.trim()) {
        // First person to join with a password locks the room
        await fetch(`/api/rooms/${r}/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, action: 'set' }),
        })
      }

      localStorage.setItem('quorum-name', n)
      localStorage.setItem('quorum-color', color)
      onJoin(r, n, color, password)
      window.history.pushState({}, '', `/${r}`)
    } catch {
      setAuthError('Could not reach server — is it running?')
    } finally {
      setChecking(false)
    }
  }

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') submit() }

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: 380,
        background: 'rgba(255,255,255,0.80)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.85)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 8px 32px rgba(0,40,120,0.12), inset 0 1px 0 rgba(255,255,255,0.95)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="/favicon.png" alt="" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text)' }}>
              Glyph <span style={{ color: 'var(--accent)' }}>Quorum</span>
            </h1>
            <p style={{ fontSize: 12, color: 'var(--overlay)', marginTop: 2 }}>
              Collaborative live Typst editing
            </p>
          </div>
        </div>

        <div style={{ padding: '20px 28px 24px' }}>
          <label style={labelStyle}>Room name</label>
          <input value={room} onChange={e => setRoom(e.target.value)} onKeyDown={onKey}
            placeholder="my-document" autoFocus style={inputStyle} />

          <label style={labelStyle}>Your name</label>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey}
            placeholder="Anonymous" style={inputStyle} />

          <label style={labelStyle}>Your colour</label>
          <div style={{ display: 'flex', gap: 7, marginBottom: 16 }}>
            {COLORS.map(c => (
              <div key={c} onClick={() => setColor(c)} style={{
                width: 22, height: 22, borderRadius: '50%', background: c,
                cursor: 'pointer',
                outline: color === c ? `3px solid ${c}` : 'none',
                outlineOffset: 2,
                transition: 'outline .1s',
              }} />
            ))}
          </div>

          <label style={labelStyle}>Password <span style={{ color: 'var(--overlay)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — leave blank for public room)</span></label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={onKey}
            placeholder="••••••••"
            style={inputStyle}
          />

          {authError && (
            <div style={{
              marginBottom: 14, padding: '8px 10px', borderRadius: 'var(--radius-sm)',
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
              fontSize: 12, color: 'var(--red)',
            }}>
              {authError}
            </div>
          )}

          <button
            onClick={submit}
            disabled={checking}
            style={{
              width: '100%',
              padding: '10px 0',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              background: checking ? 'rgba(37,99,235,0.5)' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              cursor: checking ? 'default' : 'pointer',
              letterSpacing: '-0.01em',
            }}
          >
            {checking ? 'Checking…' : 'Join room →'}
          </button>
        </div>

        {rooms.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: '14px 28px 18px' }}>
            <p style={{ ...labelStyle, marginBottom: 8 }}>Rooms on this server</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rooms.map(r => (
                <div
                  key={r.name}
                  onClick={() => setRoom(r.name)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 9px', borderRadius: 'var(--radius-sm)',
                    background: room === r.name ? 'rgba(37,99,235,0.08)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${room === r.name ? 'rgba(37,99,235,0.2)' : 'rgba(0,0,0,0.06)'}`,
                    cursor: 'pointer', transition: 'background .1s',
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>{r.name}</span>
                  {r.protected && (
                    <span style={{ fontSize: 10, color: 'var(--overlay)', background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 10 }}>locked</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--overlay)',
  marginBottom: 5,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}
const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginBottom: 14,
  padding: '8px 10px',
  fontSize: 13,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid rgba(0,0,0,0.10)',
  background: 'rgba(255,255,255,0.65)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  outline: 'none',
}

// ── Editor View ──────────────────────────────────────────────────────────────

function FontSizeBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--subtext)', fontFamily: 'sans-serif', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      {children}
    </button>
  )
}

const panelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
  borderRadius: 'var(--radius)',
  // isolation: isolate forces a new stacking context, ensuring overflow:hidden
  // properly clips Monaco's composited rendering layers at the rounded corners
  isolation: 'isolate',
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 8px 32px rgba(0,40,120,0.08), 0 1px 4px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.95)',
}

function EditorView({ roomId, userName, userColor, password, onLeave }: {
  roomId: string; userName: string; userColor: string; password: string; onLeave: () => void
}) {
  const { connected, users, comments, changes, bindEditor, addComment, resolveComment } = useCollab(roomId, userName, userColor, password)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const [content, setContent] = useState('')
  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview'>('split')
  const [fontSize, setFontSize] = useState(14)
  const { pdfBytes, error, isCompiling, recompile } = useCompiler(content, roomId)

  const handleMount = useCallback((ed: MonacoEditor.IStandaloneCodeEditor) => {
    editorRef.current = ed
    bindEditor(ed)
  }, [bindEditor])

  const getSource = useCallback(() => editorRef.current?.getValue() ?? '', [])
  const loadContent = useCallback((text: string) => { editorRef.current?.setValue(text) }, [])
  const { upload: _upload } = useAssets(roomId)

  // Trigger immediate recompile after assets are uploaded so images appear
  const uploadAssets = useCallback(async (files: FileList) => {
    await _upload(files)
    recompile()
  }, [_upload, recompile])

  const handleDelete = useCallback(async () => {
    if (!window.confirm(`Permanently delete room "${roomId}" and all its content? This cannot be undone.`)) return
    await fetch(`/api/rooms/${roomId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    onLeave()
  }, [roomId, password, onLeave])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        roomId={roomId}
        roomPassword={password}
        connected={connected}
        isCompiling={isCompiling}
        hasError={!!error}
        users={users}
        ownName={userName}
        ownColor={userColor}
        pdfBytes={pdfBytes}
        getSource={getSource}
        onLoadContent={loadContent}
        onUploadAssets={uploadAssets}
        onLeave={onLeave}
        onDelete={handleDelete}
        viewMode={viewMode}
        onViewMode={setViewMode}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: 10, gap: 10 }}>
        {viewMode !== 'preview' && (
          <div style={{ ...panelStyle, flexDirection: 'column' }}>
            <Editor onMount={handleMount} onContentChange={setContent} fontSize={fontSize} comments={comments} />
            {/* Font size controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '6px 12px', borderTop: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
              <FontSizeBtn onClick={() => setFontSize(s => Math.max(10, s - 1))}>−</FontSizeBtn>
              <span
                onClick={() => setFontSize(14)}
                title="Reset font size"
                style={{ fontSize: 11, fontFamily: 'inherit', color: 'var(--subtext)', cursor: 'pointer', minWidth: 40, textAlign: 'center' }}
              >
                {fontSize}px
              </span>
              <FontSizeBtn onClick={() => setFontSize(s => Math.min(28, s + 1))}>+</FontSizeBtn>
            </div>
          </div>
        )}

        {viewMode !== 'editor' && (
          <div style={panelStyle}>
            <Preview pdfBytes={pdfBytes} error={error} isCompiling={isCompiling} />
          </div>
        )}

        <Sidebar
          comments={comments}
          changes={changes}
          users={users}
          ownName={userName}
          ownColor={userColor}
          docId={roomId}
          editorRef={editorRef}
          onAddComment={addComment}
          onResolveComment={resolveComment}
        />
      </div>
    </div>
  )
}

// ── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  const initialRoom = window.location.pathname.slice(1) || null
  const savedName   = localStorage.getItem('quorum-name') ?? ''
  const savedColor  = localStorage.getItem('quorum-color') ?? randomColor()

  const [session, setSession] = useState<{ room: string; name: string; color: string; password: string } | null>(
    initialRoom && savedName ? { room: initialRoom, name: savedName, color: savedColor, password: '' } : null
  )

  const handleJoin = useCallback((room: string, name: string, color: string, password: string) => {
    setSession({ room, name, color, password })
  }, [])

  const handleLeave = useCallback(() => {
    setSession(null)
    window.history.pushState({}, '', '/')
  }, [])

  if (!session) return <JoinScreen onJoin={handleJoin} />

  return <EditorView roomId={session.room} userName={session.name} userColor={session.color} password={session.password} onLeave={handleLeave} />
}

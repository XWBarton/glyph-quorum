import React, { useState, useRef, useEffect } from 'react'
import * as monaco from 'monaco-editor'
import type { Comment, UserPresence, Change } from '../hooks/useCollab'
import { CommentThread } from './CommentThread'
import { ChangesList } from './ChangesList'
import { useAssets } from '../hooks/useAssets'
import type { editor as MonacoEditor } from 'monaco-editor'

type Tab = 'comments' | 'changes' | 'assets' | 'users'

interface Props {
  comments: Comment[]
  changes: Change[]
  users: UserPresence[]
  ownName: string
  ownColor: string
  docId: string
  editorRef: React.RefObject<MonacoEditor.IStandaloneCodeEditor | null>
  onAddComment: (c: Omit<Comment, 'id' | 'createdAt' | 'author' | 'authorColor'> & { text: string }) => void
  onResolveComment: (id: string) => void
}

export function Sidebar({ comments, changes, users, ownName, ownColor, docId, editorRef, onAddComment, onResolveComment }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<Tab>('comments')
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const { assets, uploading, error: assetError, refresh, upload, remove } = useAssets(docId)

  useEffect(() => { if (tab === 'assets') refresh() }, [tab, refresh])

  const addComment = () => {
    const ed = editorRef.current
    const text = draft.trim()
    if (!text || !ed) return
    const sel = ed.getSelection()
    const pos = ed.getPosition()
    const range = sel
      ? { startLineNumber: sel.startLineNumber, startColumn: sel.startColumn, endLineNumber: sel.endLineNumber, endColumn: sel.endColumn }
      : { startLineNumber: pos?.lineNumber ?? 1, startColumn: pos?.column ?? 1, endLineNumber: pos?.lineNumber ?? 1, endColumn: pos?.column ?? 1 }
    onAddComment({ text, range, resolved: false })
    setDraft('')
  }

  const activeComments = comments.filter(c => !c.resolved)
  const resolvedComments = comments.filter(c => c.resolved)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'comments', label: activeComments.length ? `Comments (${activeComments.length})` : 'Comments' },
    { id: 'changes',  label: 'Changes' },
    { id: 'assets',   label: 'Assets' },
    { id: 'users',    label: `Users (${users.length + 1})` },
  ]

  if (collapsed) {
    return (
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 4px', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', borderRadius: 'var(--radius)', border: '1px solid rgba(255,255,255,0.85)', boxShadow: '0 8px 32px rgba(0,40,120,0.08), inset 0 1px 0 rgba(255,255,255,0.95)' }}>
        <button onClick={() => setCollapsed(false)} title="Expand sidebar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--subtext)', fontSize: 18, lineHeight: 1, padding: 4 }}>‹</button>
        {activeComments.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 10, padding: '1px 5px' }}>{activeComments.length}</span>
        )}
      </div>
    )
  }

  return (
    <div style={{
      width: 'var(--sidebar-w)',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      borderRadius: 'var(--radius)',
      border: '1px solid rgba(255,255,255,0.85)',
      boxShadow: '0 8px 32px rgba(0,40,120,0.08), 0 1px 4px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.95)',
      overflow: 'hidden',
    }}>
      {/* Tab bar with collapse button */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 10px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.02em',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              color: tab === t.id ? 'var(--accent)' : 'var(--overlay)',
              transition: 'color .1s',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ width: 1, height: 16, background: 'rgba(0,0,0,0.08)', flexShrink: 0, alignSelf: 'center' }} />
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          style={{ background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', color: 'var(--overlay)', fontSize: 13, padding: '10px 8px', flexShrink: 0, marginBottom: -1 }}
        >
          ›
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tab === 'comments' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addComment() } }}
                placeholder="Add a comment at cursor…"
                rows={2}
                style={{
                  resize: 'none',
                  fontSize: 12,
                  padding: '7px 9px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  background: 'rgba(255,255,255,0.6)',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <button
                onClick={addComment}
                disabled={!draft.trim()}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: draft.trim() ? 'pointer' : 'default',
                  background: draft.trim() ? 'var(--accent)' : 'rgba(0,0,0,0.08)',
                  color: draft.trim() ? '#fff' : 'var(--overlay)',
                  border: 'none',
                  alignSelf: 'flex-end',
                  transition: 'background .1s',
                }}
              >
                Comment <kbd style={{ fontSize: 9, opacity: 0.7, fontFamily: 'inherit' }}>⌘↵</kbd>
              </button>
            </div>

            {activeComments.map(c => (
              <CommentThread
                key={c.id}
                comment={c}
                onResolve={onResolveComment}
                onNavigate={() => {
                  const ed = editorRef.current
                  if (!ed) return
                  ed.revealLineInCenter(c.range.startLineNumber)
                  // Select the highlighted range, or just place cursor if zero-width
                  const { startLineNumber: sl, startColumn: sc, endLineNumber: el, endColumn: ec } = c.range
                  if (sl === el && sc === ec) {
                    ed.setPosition({ lineNumber: sl, column: sc })
                  } else {
                    ed.setSelection(new monaco.Range(sl, sc, el, ec))
                  }
                  ed.focus()
                }}
              />
            ))}

            {resolvedComments.length > 0 && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ fontSize: 11, color: 'var(--overlay)', cursor: 'pointer', userSelect: 'none' }}>
                  {resolvedComments.length} resolved
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {resolvedComments.map(c => (
                    <CommentThread key={c.id} comment={c} onResolve={onResolveComment} />
                  ))}
                </div>
              </details>
            )}

            {activeComments.length === 0 && !draft && (
              <p style={{ textAlign: 'center', color: 'var(--overlay)', fontSize: 12, paddingTop: 8 }}>
                No open comments
              </p>
            )}
          </>
        )}

        {tab === 'changes' && <ChangesList changes={changes} />}

        {tab === 'assets' && (
          <>
            {/* Drop zone / upload button */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault()
                setDragOver(false)
                if (e.dataTransfer.files.length) upload(e.dataTransfer.files)
              }}
              style={{
                width: '100%',
                padding: '16px 0',
                textAlign: 'center',
                fontSize: 12,
                borderRadius: 'var(--radius-sm)',
                border: `1px dashed ${dragOver ? 'var(--accent)' : 'rgba(0,0,0,0.15)'}`,
                background: dragOver ? 'var(--accent-soft)' : 'rgba(255,255,255,0.4)',
                color: uploading ? 'var(--overlay)' : dragOver ? 'var(--accent)' : 'var(--subtext)',
                cursor: uploading ? 'default' : 'pointer',
                transition: 'border-color .1s, background .1s',
              }}
            >
              {uploading ? 'Uploading…' : 'Click or drop images here'}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.svg,.pdf"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files) upload(e.target.files); e.target.value = '' }}
            />

            {/* Error */}
            {assetError && (
              <p style={{ fontSize: 11, color: 'var(--red)', lineHeight: 1.4 }}>{assetError}</p>
            )}

            {/* Usage hint */}
            <p style={{ fontSize: 11, color: 'var(--overlay)', lineHeight: 1.5 }}>
              Reference in Typst:{' '}
              <code style={{ fontFamily: 'monospace', fontSize: 10 }}>image("filename.png")</code>
            </p>

            {/* Asset list */}
            {assets.length === 0 && !uploading && (
              <p style={{ textAlign: 'center', color: 'var(--overlay)', fontSize: 12, paddingTop: 4 }}>
                No assets yet
              </p>
            )}
            {assets.map(a => (
              <div key={a.name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(0,0,0,0.06)',
                background: 'rgba(255,255,255,0.6)',
              }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>{fileEmoji(a.name)}</span>
                <span style={{
                  flex: 1, fontSize: 12, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                }}>
                  {a.name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--overlay)', flexShrink: 0 }}>
                  {formatSize(a.size)}
                </span>
                <button
                  onClick={() => remove(a.name)}
                  title="Delete asset"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--overlay)', fontSize: 14, lineHeight: 1, padding: 2,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </>
        )}

        {tab === 'users' && (
          <>
            <UserRow name={ownName} color={ownColor} label="You" />
            {users.map(u => <UserRow key={u.clientId} name={u.name} color={u.color} />)}
          </>
        )}
      </div>
    </div>
  )
}

function fileEmoji(name: string) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (['.png','.jpg','.jpeg','.gif','.webp'].includes(ext)) return '🖼'
  if (ext === '.svg') return '✏️'
  if (ext === '.pdf') return '📄'
  return '📎'
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function UserRow({ name, color, label }: { name: string; color: string; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{name}</span>
      {label && <span style={{ fontSize: 11, color: 'var(--overlay)', marginLeft: 2 }}>{label}</span>}
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', marginLeft: 'auto' }} />
    </div>
  )
}

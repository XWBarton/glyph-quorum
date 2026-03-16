import React, { useState, useRef } from 'react'
import type { UserPresence } from '../hooks/useCollab'

interface Props {
  roomId: string
  roomPassword: string
  connected: boolean
  isCompiling: boolean
  hasError: boolean
  users: UserPresence[]
  ownName: string
  ownColor: string
  pdfBytes: Uint8Array | null
  getSource: () => string
  onLoadContent: (text: string) => void
  onUploadAssets: (files: FileList) => void
  onLeave: () => void
  onDelete: () => void
  viewMode: 'split' | 'editor' | 'preview'
  onViewMode: (m: 'split' | 'editor' | 'preview') => void
}

export function Toolbar({ roomId, roomPassword, connected, isCompiling, hasError, users, ownName, ownColor, pdfBytes, getSource, onLoadContent, onUploadAssets, onLeave, onDelete, viewMode, onViewMode }: Props) {
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openFile = () => fileInputRef.current?.click()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const typFiles  = Array.from(files).filter(f => f.name.endsWith('.typ') || f.name.endsWith('.txt'))
    const imgFiles  = Array.from(files).filter(f => !f.name.endsWith('.typ') && !f.name.endsWith('.txt'))

    // Load the first .typ file into the editor
    if (typFiles.length > 0) {
      const reader = new FileReader()
      reader.onload = ev => {
        if (typeof ev.target?.result === 'string') onLoadContent(ev.target.result)
      }
      reader.readAsText(typFiles[0])
    }

    // Upload any image/asset files
    if (imgFiles.length > 0) {
      const dt = new DataTransfer()
      imgFiles.forEach(f => dt.items.add(f))
      onUploadAssets(dt.files)
    }

    e.target.value = ''
  }

  const copyLink = () => {
    const url  = `${window.location.origin}/${roomId}`
    const text = roomPassword ? `${url}\nPassword: ${roomPassword}` : url
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const downloadPdf = () => {
    if (!pdfBytes) return
    const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${roomId}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadTyp = () => {
    const blob = new Blob([getSource()], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${roomId}.typ`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{
      height: 'var(--toolbar-h)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      flexShrink: 0,
      background: 'rgba(255,255,255,0.60)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      borderBottom: '1px solid rgba(255,255,255,0.65)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 0 rgba(0,0,0,0.04)',
    }}>
      {/* ── Left: session identity ────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
        <img src="/favicon.png" alt="" style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', userSelect: 'none', whiteSpace: 'nowrap' }}>
          Glyph <span style={{ color: 'var(--accent)' }}>Quorum</span>
        </span>
        <div style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.1)' }} />
        <span style={{ fontSize: 12, color: 'var(--overlay)' }}>
          #{roomId}{roomPassword && <span title="Password protected" style={{ marginLeft: 5, fontSize: 10, color: 'var(--subtext)', verticalAlign: 'middle' }}>[ locked ]</span>}
        </span>
        <div style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.1)' }} />
        {/* Avatar + Leave grouped together */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Avatar color={ownColor} title={ownName} />
          <ToolBtn onClick={onLeave} title="Leave this room">Leave</ToolBtn>
          <ToolBtn onClick={onDelete} danger title="Permanently delete this room and all its content">Delete</ToolBtn>
        </div>
      </div>

      {/* ── Centre: view mode ─────────────────────────── */}
      <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.8)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {(['editor', 'split', 'preview'] as const).map(m => (
          <button
            key={m}
            onClick={() => onViewMode(m)}
            title={{ editor: 'Source only', split: 'Split view', preview: 'Preview only' }[m]}
            style={{
              padding: '4px 12px',
              fontSize: 11,
              fontFamily: 'inherit',
              border: 'none',
              borderRight: m !== 'preview' ? '1px solid rgba(0,0,0,0.08)' : 'none',
              background: viewMode === m ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.55)',
              color: viewMode === m ? 'var(--accent)' : 'var(--subtext)',
              fontWeight: viewMode === m ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background .1s, color .1s',
            }}
          >
            {{ editor: 'Source', split: 'Split', preview: 'Preview' }[m]}
          </button>
        ))}
      </div>

      {/* ── Right: file actions + collaboration ──────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
        {/* File actions */}
        <ToolBtn onClick={openFile} title="Open a .typ file or upload images">Open</ToolBtn>
        <ToolBtn onClick={downloadTyp} title="Download source (.typ)">.typ</ToolBtn>
        <ToolBtn onClick={downloadPdf} disabled={!pdfBytes} title="Download PDF">PDF</ToolBtn>

        <div style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.1)' }} />

        {/* Other users' presence avatars */}
        {users.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
            {users.slice(0, 5).map(u => (
              <Avatar key={u.clientId} color={u.color} title={u.name} />
            ))}
            {users.length > 5 && (
              <span style={{ fontSize: 11, color: 'var(--overlay)', marginLeft: 6 }}>+{users.length - 5}</span>
            )}
          </div>
        )}

        {/* Status */}
        <StatusPill connected={connected} isCompiling={isCompiling} hasError={hasError} />

        <div style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.1)' }} />

        {/* Share */}
        <ToolBtn onClick={copyLink} primary title={roomPassword ? 'Copy link + password' : 'Copy room link'}>{copied ? 'Copied!' : 'Share'}</ToolBtn>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".typ,.txt,image/*,.svg,.pdf"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}

function Avatar({ color, title }: { color: string; title: string }) {
  return (
    <div
      title={title}
      style={{
        width: 24, height: 24, borderRadius: '50%',
        background: color,
        border: '2px solid rgba(255,255,255,0.9)',
        marginLeft: -6,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.1)',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, color: '#fff',
      }}
    >
      {title[0]?.toUpperCase()}
    </div>
  )
}

function StatusPill({ connected, isCompiling, hasError }: { connected: boolean; isCompiling: boolean; hasError: boolean }) {
  let bg = 'rgba(22,163,74,0.12)'
  let textColor = 'var(--green)'
  let label = 'Live'

  if (isCompiling) {
    bg = 'rgba(217,119,6,0.12)'; textColor = 'var(--yellow)'; label = 'Compiling'
  } else if (hasError) {
    bg = 'rgba(220,38,38,0.12)'; textColor = 'var(--red)'; label = 'Error'
  } else if (!connected) {
    bg = 'rgba(0,0,0,0.06)'; textColor = 'var(--overlay)'; label = 'Offline'
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: bg, borderRadius: 20, padding: '3px 10px',
      border: `1px solid ${textColor}30`,
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: textColor }} />
      <span style={{ fontSize: 11, color: textColor, fontWeight: 500 }}>{label}</span>
    </div>
  )
}

function ToolBtn({ onClick, disabled, title, primary, danger, children }: {
  onClick: () => void
  disabled?: boolean
  title?: string
  primary?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: 12,
        fontWeight: primary ? 600 : 400,
        padding: '4px 11px',
        borderRadius: 'var(--radius-sm)',
        border: primary || danger ? 'none' : `1px solid ${disabled ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.8)'}`,
        background: disabled
          ? 'rgba(255,255,255,0.25)'
          : danger
            ? hovered ? 'rgba(220,38,38,0.85)' : 'rgba(220,38,38,0.7)'
            : primary
              ? hovered ? 'rgba(37,99,235,0.85)' : 'var(--accent)'
              : hovered ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)',
        color: disabled ? 'var(--overlay)' : (primary || danger) ? '#fff' : 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: disabled ? 'none' : '0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
        transition: 'background .12s',
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </button>
  )
}

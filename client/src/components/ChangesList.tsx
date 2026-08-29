import React from 'react'
import type { Change } from '../hooks/useCollab'

interface Props {
  changes: Change[]
  trackChanges: boolean
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onNavigate: (change: Change) => void
}

export function ChangesList({ changes, trackChanges, onAccept, onReject, onNavigate }: Props) {
  const pending = changes.filter(c => c.status === 'pending')
  const rest = changes.filter(c => c.status !== 'pending')

  if (changes.length === 0) {
    return (
      <p style={{ padding: 16, textAlign: 'center', color: 'var(--overlay)', fontSize: 12 }}>
        {trackChanges ? 'No suggestions yet. Start typing to record tracked edits.' : 'No changes yet. Start typing to record history.'}
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {pending.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button onClick={() => pending.forEach(c => onAccept(c.id))} style={bulkBtnStyle('var(--green)')}>
            Accept all ({pending.length})
          </button>
          <button onClick={() => pending.forEach(c => onReject(c.id))} style={bulkBtnStyle('var(--red)')}>
            Reject all
          </button>
        </div>
      )}

      {pending.map(change => <ChangeRow key={change.id} change={change} onAccept={onAccept} onReject={onReject} onNavigate={onNavigate} />)}

      {pending.length > 0 && rest.length > 0 && (
        <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '4px 0 8px' }} />
      )}

      {rest.map(change => <ChangeRow key={change.id} change={change} onAccept={onAccept} onReject={onReject} onNavigate={onNavigate} />)}
    </div>
  )
}

function ChangeRow({ change, onAccept, onReject, onNavigate }: {
  change: Change
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onNavigate: (change: Change) => void
}) {
  const timeStr = new Date(change.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const isInsert = change.kind === 'insert' || change.summary.startsWith('+')
  const isDelete = change.kind === 'delete' || change.summary.startsWith('-')
  const pending = change.status === 'pending'
  const navigable = pending && change.startOffset !== undefined

  return (
    <div
      onClick={navigable ? () => onNavigate(change) : undefined}
      style={{
        padding: '9px 10px',
        marginBottom: 6,
        borderRadius: 'var(--radius-sm)',
        background: pending ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.03)',
        border: '1px solid rgba(0,0,0,0.06)',
        borderLeft: `3px solid ${change.authorColor}`,
        opacity: pending ? 1 : 0.6,
        animation: 'fadeIn .12s ease',
        cursor: navigable ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: change.authorColor, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{change.author}</span>
        <span style={{ fontSize: 10, color: 'var(--overlay)', marginLeft: 'auto' }}>{timeStr}</span>
      </div>
      <code style={{
        fontSize: 10,
        fontFamily: "'JetBrains Mono', Menlo, monospace",
        color: isInsert ? 'var(--green)' : isDelete ? 'var(--red)' : 'var(--subtext)',
        wordBreak: 'break-all',
        display: 'block',
        whiteSpace: 'pre-wrap',
        paddingLeft: 0,
      }}>
        {change.summary.slice(0, 120)}{change.summary.length > 120 ? '…' : ''}
      </code>

      {pending && (
        <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
          <button onClick={e => { e.stopPropagation(); onAccept(change.id) }} style={rowBtnStyle('var(--green)')}>
            ✓ Accept
          </button>
          <button onClick={e => { e.stopPropagation(); onReject(change.id) }} style={rowBtnStyle('var(--red)')}>
            ✕ Reject
          </button>
        </div>
      )}
      {!pending && change.status && (
        <span style={{ fontSize: 10, color: change.status === 'accepted' ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
          {change.status === 'accepted' ? '✓ Accepted' : '✕ Rejected'}
        </span>
      )}
    </div>
  )
}

function rowBtnStyle(color: string): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 500,
    padding: '3px 9px',
    borderRadius: 'var(--radius-sm)',
    border: `1px solid ${color}40`,
    background: `${color}14`,
    color,
    cursor: 'pointer',
  }
}

function bulkBtnStyle(color: string): React.CSSProperties {
  return {
    flex: 1,
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 0',
    borderRadius: 'var(--radius-sm)',
    border: `1px solid ${color}40`,
    background: `${color}14`,
    color,
    cursor: 'pointer',
  }
}

import React from 'react'
import type { Change } from '../hooks/useCollab'

interface Props {
  changes: Change[]
}

export function ChangesList({ changes }: Props) {
  if (changes.length === 0) {
    return (
      <p style={{ padding: 16, textAlign: 'center', color: 'var(--overlay)', fontSize: 12 }}>
        No changes yet. Start typing to record history.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {changes.map((change, i) => {
        const timeStr = new Date(change.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        const isInsert = change.summary.startsWith('+')
        const isDelete = change.summary.startsWith('-')

        return (
          <div key={change.id} style={{
            padding: '9px 10px',
            marginBottom: 6,
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255,255,255,0.5)',
            border: '1px solid rgba(0,0,0,0.06)',
            borderLeft: `3px solid ${change.authorColor}`,
            animation: 'fadeIn .12s ease',
          }}>
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
          </div>
        )
      })}
    </div>
  )
}

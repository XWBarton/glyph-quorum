import React from 'react'
import type { Comment } from '../hooks/useCollab'

interface Props {
  comment: Comment
  onResolve: (id: string) => void
  onNavigate?: () => void
}

export function CommentThread({ comment, onResolve, onNavigate }: Props) {
  const timeStr = new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      onClick={onNavigate}
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius-sm)',
        background: comment.resolved ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.65)',
        border: '1px solid rgba(0,0,0,0.06)',
        borderLeft: `3px solid ${comment.resolved ? 'rgba(0,0,0,0.12)' : comment.authorColor}`,
        opacity: comment.resolved ? 0.6 : 1,
        animation: 'fadeIn .15s ease',
        cursor: onNavigate ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{comment.author}</span>
        <span style={{ fontSize: 11, color: 'var(--overlay)', marginLeft: 'auto' }}>{timeStr}</span>
      </div>

      <p style={{ fontSize: 12, color: 'var(--subtext)', lineHeight: 1.55, marginBottom: 8 }}>
        {comment.text}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--overlay)', fontFamily: 'monospace' }}>
          L{comment.range.startLineNumber}:{comment.range.startColumn}
        </span>
        {!comment.resolved && (
          <button
            onClick={() => onResolve(comment.id)}
            style={{
              marginLeft: 'auto', fontSize: 11, fontWeight: 500,
              color: 'var(--accent)', background: 'none',
              border: 'none', cursor: 'pointer', padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Resolve
          </button>
        )}
        {comment.resolved && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--green)', fontWeight: 500 }}>✓ Resolved</span>
        )}
      </div>
    </div>
  )
}

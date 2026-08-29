import { useEffect, useRef, useState, useCallback } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { MonacoBinding } from 'y-monaco'
import type { editor as MonacoEditor } from 'monaco-editor'

export interface UserPresence {
  clientId: number
  name: string
  color: string
}

export interface Comment {
  id: string
  text: string
  author: string
  authorColor: string
  /** Monaco IRange-compatible */
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }
  createdAt: number
  resolved: boolean
}

export interface Change {
  id: string
  author: string
  authorColor: string
  summary: string   // short description of what changed
  timestamp: number
  origin: string    // 'local' | clientId
  /** Present only for changes recorded while Track Changes was on. */
  kind?: 'insert' | 'delete'
  status?: 'pending' | 'accepted' | 'rejected'
  /** For a pending delete: the removed text, kept so it can be restored on reject. */
  text?: string
  /** Yjs relative-position JSON anchors into the shared `content` text. */
  relStart?: ReturnType<typeof Y.relativePositionToJSON>
  relEnd?: ReturnType<typeof Y.relativePositionToJSON>
  /** Resolved live character offsets into the current document, recomputed on every sync. Not persisted. */
  startOffset?: number
  endOffset?: number
}

const TRACK_CHANGES_KEY = 'quorum-track-changes'
const MERGE_WINDOW_MS = 2000

function relPos(yText: Y.Text, index: number) {
  return Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(yText, index))
}

function resolveOffset(doc: Y.Doc, json: ReturnType<typeof Y.relativePositionToJSON> | undefined): number | undefined {
  if (!json) return undefined
  const abs = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), doc)
  return abs?.index
}

// In dev, use the env var (proxied to localhost:3000).
// In production, connect back to whatever host served the page so it works
// behind any reverse proxy or Cloudflare Tunnel with zero config.
const WS_URL = import.meta.env.VITE_WS_URL ??
  (import.meta.env.DEV
    ? 'ws://localhost:3000'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`)

export function useCollab(roomId: string, userName: string, userColor: string, password = '') {
  const [connected, setConnected] = useState(false)
  const [users, setUsers] = useState<UserPresence[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [changes, setChanges] = useState<Change[]>([])
  const [trackChanges, setTrackChanges] = useState(() => localStorage.getItem(TRACK_CHANGES_KEY) === '1')

  const docRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<HocuspocusProvider | null>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)
  const yCommentsRef = useRef<Y.Array<Comment> | null>(null)
  const yChangesRef = useRef<Y.Array<Change> | null>(null)
  const trackChangesRef = useRef(trackChanges)
  const suppressTrackingRef = useRef(false)

  useEffect(() => {
    trackChangesRef.current = trackChanges
    localStorage.setItem(TRACK_CHANGES_KEY, trackChanges ? '1' : '0')
  }, [trackChanges])

  useEffect(() => {
    const doc = new Y.Doc()
    docRef.current = doc

    const provider = new HocuspocusProvider({
      url: `${WS_URL}/ws`,
      name: roomId,
      document: doc,
      parameters: { user: userName, password },
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
      onSynced: () => setConnected(true),
    })
    providerRef.current = provider

    // Set own presence
    provider.setAwarenessField('user', { name: userName, color: userColor })

    // Track other users
    const awareness = provider.awareness!
    const updateUsers = () => {
      const list: UserPresence[] = []
      awareness.getStates().forEach((state, clientId) => {
        if (clientId !== doc.clientID && state.user) {
          list.push({ clientId, name: state.user.name, color: state.user.color })
        }
      })
      setUsers(list)
    }
    awareness.on('update', updateUsers)

    // Comments shared array
    const yComments = doc.getArray<Comment>('comments')
    yCommentsRef.current = yComments
    const syncComments = () => setComments(yComments.toArray())
    yComments.observe(syncComments)

    // Changes log (append-only, capped at 100). Re-synced whenever the log
    // changes OR the document text changes, since pending entries' positions
    // are anchored with Yjs relative positions that need re-resolving as the
    // document is edited.
    const yChanges = doc.getArray<Change>('changes')
    yChangesRef.current = yChanges
    const syncChanges = () => {
      const list = yChanges.toArray().slice(-100).reverse().map(c => {
        if (c.status !== 'pending') return c
        return {
          ...c,
          startOffset: resolveOffset(doc, c.relStart),
          endOffset: resolveOffset(doc, c.relEnd ?? c.relStart),
        }
      })
      setChanges(list)
    }
    yChanges.observe(syncChanges)

    const yText = doc.getText('content')
    let prevText = yText.toString()

    // Plain history log (used when Track Changes is off).
    // Debounce so rapid keystrokes are consolidated into one entry.
    let insertBuf = ''
    let deleteBuf = 0
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const flushChange = () => {
      debounceTimer = null
      const parts: string[] = []
      if (insertBuf) parts.push(`+${insertBuf.slice(0, 80).replace(/\n/g, '↵')}`)
      if (deleteBuf) parts.push(`-${deleteBuf} chars`)
      const summary = parts.join('  ')
      insertBuf = ''
      deleteBuf = 0
      if (!summary) return
      const entry: Change = {
        id: Math.random().toString(36).slice(2),
        author: userName,
        authorColor: userColor,
        summary,
        timestamp: Date.now(),
        origin: 'local',
      }
      yChanges.push([entry])
    }

    // Track Changes: pending insert/delete suggestions, anchored with Yjs
    // relative positions so they stay correct as the document is edited.
    // Rapid adjacent edits by the same actor are merged into one suggestion.
    const activeInsertRef: { current: { id: string; endIndex: number; text: string; lastActivity: number } | null } = { current: null }
    const activeDeleteRef: { current: { id: string; anchorIndex: number; text: string; lastActivity: number } | null } = { current: null }

    const updateChangeEntry = (id: string, patch: Partial<Change>) => {
      const arr = yChanges.toArray()
      const idx = arr.findIndex(c => c.id === id)
      if (idx < 0) return
      const updated: Change = { ...arr[idx], ...patch }
      doc.transact(() => { yChanges.delete(idx, 1); yChanges.insert(idx, [updated]) })
    }

    const recordInsert = (index: number, text: string) => {
      const now = Date.now()
      const active = activeInsertRef.current
      if (active && now - active.lastActivity < MERGE_WINDOW_MS && active.endIndex === index) {
        active.endIndex = index + text.length
        active.text += text
        active.lastActivity = now
        updateChangeEntry(active.id, {
          relEnd: relPos(yText, active.endIndex),
          summary: `+${active.text.slice(0, 80).replace(/\n/g, '↵')}`,
          timestamp: now,
        })
        activeDeleteRef.current = null
        return
      }
      const id = Math.random().toString(36).slice(2)
      const entry: Change = {
        id, author: userName, authorColor: userColor,
        summary: `+${text.slice(0, 80).replace(/\n/g, '↵')}`,
        timestamp: now, origin: 'local',
        kind: 'insert', status: 'pending',
        relStart: relPos(yText, index),
        relEnd: relPos(yText, index + text.length),
      }
      yChanges.push([entry])
      activeInsertRef.current = { id, endIndex: index + text.length, text, lastActivity: now }
      activeDeleteRef.current = null
    }

    const recordDelete = (index: number, removed: string) => {
      const now = Date.now()
      const active = activeDeleteRef.current
      if (active && now - active.lastActivity < MERGE_WINDOW_MS) {
        if (index === active.anchorIndex) {
          // Forward delete (Delete key): gap position stays put, append.
          active.text += removed
          active.lastActivity = now
          updateChangeEntry(active.id, { text: active.text, summary: `-${active.text.slice(0, 80).replace(/\n/g, '↵')}`, timestamp: now })
          activeInsertRef.current = null
          return
        }
        if (index + removed.length === active.anchorIndex) {
          // Backspace: gap position moves left, prepend.
          active.text = removed + active.text
          active.anchorIndex = index
          active.lastActivity = now
          updateChangeEntry(active.id, {
            text: active.text,
            summary: `-${active.text.slice(0, 80).replace(/\n/g, '↵')}`,
            relStart: relPos(yText, index),
            relEnd: relPos(yText, index),
            timestamp: now,
          })
          activeInsertRef.current = null
          return
        }
      }
      const id = Math.random().toString(36).slice(2)
      const entry: Change = {
        id, author: userName, authorColor: userColor,
        summary: `-${removed.slice(0, 80).replace(/\n/g, '↵')}`,
        timestamp: now, origin: 'local',
        kind: 'delete', status: 'pending',
        text: removed,
        relStart: relPos(yText, index),
        relEnd: relPos(yText, index),
      }
      yChanges.push([entry])
      activeDeleteRef.current = { id, anchorIndex: index, text: removed, lastActivity: now }
      activeInsertRef.current = null
    }

    yText.observe((event) => {
      if (suppressTrackingRef.current) { prevText = yText.toString(); return }
      if (!event.transaction.local) {
        prevText = yText.toString()
        activeInsertRef.current = null
        activeDeleteRef.current = null
        return
      }
      let oldIdx = 0, newIdx = 0
      for (const op of event.changes.delta) {
        if (op.retain) { oldIdx += op.retain; newIdx += op.retain }
        else if (op.insert) {
          const str = String(op.insert)
          insertBuf += str
          if (trackChangesRef.current) recordInsert(newIdx, str)
          newIdx += str.length
        } else if (op.delete) {
          const removed = prevText.slice(oldIdx, oldIdx + op.delete)
          deleteBuf += op.delete
          if (trackChangesRef.current) recordDelete(newIdx, removed)
          oldIdx += op.delete
        }
      }
      prevText = yText.toString()
      if (!trackChangesRef.current) {
        if (debounceTimer !== null) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(flushChange, 1500)
      }
    })

    return () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer)
      awareness.off('update', updateUsers)
      yComments.unobserve(syncComments)
      yChanges.unobserve(syncChanges)
      bindingRef.current?.destroy()
      bindingRef.current = null
      provider.destroy()
      doc.destroy()
      docRef.current = null
      providerRef.current = null
    }
  }, [roomId, userName, userColor, password])

  /** Call this from the Monaco onMount handler to bind the editor. */
  const bindEditor = useCallback((ed: MonacoEditor.IStandaloneCodeEditor) => {
    const doc = docRef.current
    const provider = providerRef.current
    if (!doc || !provider) return

    const model = ed.getModel()
    if (!model) return

    const yText = doc.getText('content')

    // Destroy previous binding if editor remounted
    bindingRef.current?.destroy()
    const binding = new MonacoBinding(yText, model, new Set([ed]), providerRef.current?.awareness ?? undefined)
    bindingRef.current = binding
  }, [])

  const addComment = useCallback((comment: Omit<Comment, 'id' | 'createdAt' | 'author' | 'authorColor'> & { text: string }) => {
    const full: Comment = {
      ...comment,
      id: Math.random().toString(36).slice(2),
      author: userName,
      authorColor: userColor,
      createdAt: Date.now(),
      resolved: false,
    }
    yCommentsRef.current?.push([full])
  }, [userName, userColor])

  const resolveComment = useCallback((id: string) => {
    const arr = yCommentsRef.current
    if (!arr || !docRef.current) return
    const idx = arr.toArray().findIndex(c => c.id === id)
    if (idx < 0) return
    const updated: Comment = { ...arr.get(idx), resolved: true }
    docRef.current.transact(() => {
      arr.delete(idx, 1)
      arr.insert(idx, [updated])
    })
  }, [])

  /** Finalize a pending suggestion: the edit already happened, so just mark it resolved. */
  const acceptChange = useCallback((id: string) => {
    const doc = docRef.current
    const arr = yChangesRef.current
    if (!doc || !arr) return
    const idx = arr.toArray().findIndex(c => c.id === id)
    if (idx < 0) return
    const updated: Change = { ...arr.get(idx), status: 'accepted' }
    suppressTrackingRef.current = true
    doc.transact(() => { arr.delete(idx, 1); arr.insert(idx, [updated]) })
    suppressTrackingRef.current = false
  }, [])

  /** Undo a pending suggestion: remove a suggested insertion, or restore a suggested deletion. */
  const rejectChange = useCallback((id: string) => {
    const doc = docRef.current
    const arr = yChangesRef.current
    if (!doc || !arr) return
    const idx = arr.toArray().findIndex(c => c.id === id)
    if (idx < 0) return
    const change = arr.get(idx)
    const yText = doc.getText('content')

    suppressTrackingRef.current = true
    doc.transact(() => {
      if (change.kind === 'insert') {
        const start = resolveOffset(doc, change.relStart)
        const end = resolveOffset(doc, change.relEnd)
        if (start !== undefined && end !== undefined && end > start) yText.delete(start, end - start)
      } else if (change.kind === 'delete' && change.text) {
        const start = resolveOffset(doc, change.relStart)
        if (start !== undefined) yText.insert(start, change.text)
      }
      const updated: Change = { ...change, status: 'rejected' }
      arr.delete(idx, 1)
      arr.insert(idx, [updated])
    })
    suppressTrackingRef.current = false
  }, [])

  return {
    connected,
    users,
    comments,
    changes,
    trackChanges,
    setTrackChanges,
    bindEditor,
    addComment,
    resolveComment,
    acceptChange,
    rejectChange,
  }
}

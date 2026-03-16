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

  const docRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<HocuspocusProvider | null>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)
  const yCommentsRef = useRef<Y.Array<Comment> | null>(null)
  const yChangesRef = useRef<Y.Array<Change> | null>(null)

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

    // Changes log (append-only, capped at 100)
    const yChanges = doc.getArray<Change>('changes')
    yChangesRef.current = yChanges
    const syncChanges = () => setChanges(yChanges.toArray().slice(-100).reverse())
    yChanges.observe(syncChanges)

    // Record a change entry whenever the shared text is modified.
    // Debounce so rapid keystrokes are consolidated into one entry.
    const yText = doc.getText('content')
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

    yText.observe((event) => {
      if (!event.transaction.local) return
      for (const op of event.changes.delta) {
        if (op.insert) insertBuf += String(op.insert)
        if (op.delete) deleteBuf += op.delete
      }
      if (debounceTimer !== null) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(flushChange, 1500)
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

  return {
    connected,
    users,
    comments,
    changes,
    bindEditor,
    addComment,
    resolveComment,
  }
}

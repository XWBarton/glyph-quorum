import { useState, useEffect, useRef, useCallback } from 'react'

const DEBOUNCE_MS = 1500

export function useCompiler(content: string, docId: string) {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef  = useRef<AbortController | null>(null)
  const contentRef = useRef(content)
  const docIdRef   = useRef(docId)
  contentRef.current = content
  docIdRef.current   = docId

  const compile = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setIsCompiling(true)
    try {
      const res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentRef.current, docId: docIdRef.current }),
        signal: ctrl.signal,
      })
      if (ctrl.signal.aborted) return
      const data = await res.json()
      if (data.ok) {
        const bytes = Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0))
        setPdfBytes(bytes)
        setError(null)
      } else {
        setError(data.error ?? 'Compilation failed')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(`Server error: ${(e as Error).message}`)
      }
    } finally {
      if (!ctrl.signal.aborted) setIsCompiling(false)
    }
  }, [])

  // Debounced compile on content change
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(compile, DEBOUNCE_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [content, docId, compile])

  // Immediate recompile (e.g. after asset upload)
  const recompile = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    compile()
  }, [compile])

  return { pdfBytes, error, isCompiling, recompile }
}

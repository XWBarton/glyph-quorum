import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface Props {
  pdfBytes: Uint8Array | null
  error: string | null
  isCompiling: boolean
}

export function Preview({ pdfBytes, error, isCompiling }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const outerRef      = useRef<HTMLDivElement>(null)
  const versionRef    = useRef(0)
  const [zoom, setZoom]             = useState(1)
  const [containerWidth, setContainerWidth] = useState(0)

  // Track container width so the PDF re-renders when the panel is resized
  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const changeZoom = useCallback((delta: number) => {
    setZoom(z => Math.min(3, Math.max(0.25, Math.round((z + delta) * 100) / 100))
    )
  }, [])

  useEffect(() => {
    if (!pdfBytes || !containerRef.current) return
    const version = ++versionRef.current
    const container = containerRef.current

    const run = async () => {
      try {
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise
        if (version !== versionRef.current) return

        const dpr = window.devicePixelRatio || 1
        const availableWidth = container.clientWidth - 48
        const fragment = document.createDocumentFragment()

        for (let p = 1; p <= doc.numPages; p++) {
          if (version !== versionRef.current) return
          const page = await doc.getPage(p)
          const base = page.getViewport({ scale: 1 })
          const scale = (availableWidth / base.width) * dpr * zoom
          const vp = page.getViewport({ scale })

          const canvas = document.createElement('canvas')
          canvas.width  = vp.width
          canvas.height = vp.height
          canvas.style.cssText = `display:block;width:${vp.width/dpr}px;height:${vp.height/dpr}px;margin:0 auto;border-radius:4px;box-shadow:0 2px 16px rgba(0,0,0,.1);`
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
          if (version !== versionRef.current) return

          const wrap = document.createElement('div')
          wrap.style.cssText = 'padding:12px 24px;'
          wrap.appendChild(canvas)
          fragment.appendChild(wrap)
        }

        if (version !== versionRef.current) return
        container.innerHTML = ''
        container.appendChild(fragment)
      } catch (e) {
        console.error('PDF render error:', e)
      }
    }
    run()
  }, [pdfBytes, zoom, containerWidth])

  return (
    <div ref={outerRef} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 4 }}>
        {!pdfBytes && !error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--overlay)' }}>
            {isCompiling
              ? <><Spinner /><span style={{ fontSize: 12 }}>Compiling…</span></>
              : <span style={{ fontSize: 13 }}>Start typing to see preview</span>}
          </div>
        )}
      </div>

      {/* Zoom controls */}
      {pdfBytes && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '6px 12px',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          background: 'rgba(255,255,255,0.5)',
          flexShrink: 0,
        }}>
          <ZoomBtn onClick={() => changeZoom(-0.1)}>−</ZoomBtn>
          <button
            onClick={() => setZoom(1)}
            title="Reset zoom"
            style={{ fontSize: 11, fontFamily: 'inherit', color: 'var(--subtext)', background: 'none', border: 'none', cursor: 'pointer', minWidth: 40, textAlign: 'center' }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <ZoomBtn onClick={() => changeZoom(0.1)}>+</ZoomBtn>
        </div>
      )}

      {error && (
        <div style={{ position: 'absolute', bottom: pdfBytes ? 48 : 14, left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,.92)', border: '1px solid rgba(198,40,40,.25)', borderRadius: 'var(--radius)', padding: '8px 14px', maxWidth: '88%', zIndex: 10, whiteSpace: 'pre-wrap', fontFamily: "'JetBrains Mono', Menlo, monospace", fontSize: 11, color: 'var(--red)', pointerEvents: 'none', boxShadow: '0 4px 20px rgba(198,40,40,.08)' }}>
          {error}
        </div>
      )}
    </div>
  )
}

function ZoomBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 24, height: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, lineHeight: 1,
        background: 'none',
        border: '1px solid rgba(255,255,255,0.8)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        color: 'var(--subtext)',
        fontFamily: 'sans-serif',
      }}
    >
      {children}
    </button>
  )
}

function Spinner() {
  return <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(37,99,235,.15)', borderTopColor: 'var(--accent)', animation: 'spin .7s linear infinite' }} />
}

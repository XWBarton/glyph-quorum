import React, { useCallback, useEffect, useRef, useState } from 'react'
import MonacoEditor, { loader, type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
// @ts-ignore
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { registerTypstLanguage, TYPST_LANGUAGE_ID } from '../lib/typstLanguage'
import { buildMonacoTheme } from '../lib/tokenColors'
import { filterCommands, type SlashCommand } from '../lib/slashCommands'
import { SlashCommandPalette } from './SlashCommandPalette'
import type { Comment } from '../hooks/useCollab'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(self as any).MonacoEnvironment = { getWorker: () => new editorWorker() }
loader.config({ monaco })

registerTypstLanguage(monaco)
monaco.editor.defineTheme('quorum-typst', buildMonacoTheme({}))

interface PaletteState {
  open: boolean
  x: number
  y: number
  commands: SlashCommand[]
  selectedIndex: number
}

interface Props {
  onMount: (ed: monaco.editor.IStandaloneCodeEditor) => void
  onContentChange: (text: string) => void
  fontSize: number
  comments: Comment[]
}

export function Editor({ onMount: onMountProp, onContentChange, fontSize, comments }: Props) {
  const editorRef      = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const containerRef   = useRef<HTMLDivElement>(null)
  const slashPosRef    = useRef<{ lineNumber: number; column: number } | null>(null)
  const decorationsRef = useRef<string[]>([])

  const [palette, setPalette] = useState<PaletteState>({
    open: false, x: 0, y: 0, commands: [], selectedIndex: 0,
  })
  const paletteRef = useRef(palette)
  paletteRef.current = palette

  const doInsert = useCallback((cmd: SlashCommand) => {
    const ed    = editorRef.current
    const slash = slashPosRef.current
    if (!ed || !slash) return
    const pos = ed.getPosition()
    if (!pos) return
    slashPosRef.current = null
    setPalette(p => ({ ...p, open: false }))
    const sl = slash.lineNumber, sc = slash.column
    const el = pos.lineNumber,   ec = pos.column
    const snippet = cmd.snippet
    // Set selection over the slash text so SnippetController replaces it
    setTimeout(() => {
      ed.setSelection(new monaco.Selection(sl, sc, el, ec))
      ed.focus()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctrl = ed.getContribution('snippetController2') as any
      if (ctrl?.insert) {
        ctrl.insert(snippet)
      } else {
        ed.trigger('slash', 'editor.action.insertSnippet', { snippet })
      }
    }, 0)
  }, [])

  const closePalette = useCallback(() => {
    slashPosRef.current = null
    setPalette(p => ({ ...p, open: false }))
  }, [])

  // Stable refs so the native capture handler always sees the latest callbacks
  const doInsertRef   = useRef(doInsert)
  const closePalRef   = useRef(closePalette)
  doInsertRef.current   = doInsert
  closePalRef.current   = closePalette

  // Native DOM capture listener — fires in the real DOM capture phase,
  // BEFORE Monaco's textarea event handlers, so stopPropagation actually works.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      if (!paletteRef.current.open) return
      if (e.key === 'Enter') {
        e.stopPropagation(); e.preventDefault()
        const cmd = paletteRef.current.commands[paletteRef.current.selectedIndex]
        if (cmd) doInsertRef.current(cmd)
      } else if (e.key === 'ArrowDown') {
        e.stopPropagation(); e.preventDefault()
        setPalette(p => ({ ...p, selectedIndex: Math.min(p.commands.length - 1, p.selectedIndex + 1) }))
      } else if (e.key === 'ArrowUp') {
        e.stopPropagation(); e.preventDefault()
        setPalette(p => ({ ...p, selectedIndex: Math.max(0, p.selectedIndex - 1) }))
      } else if (e.key === 'Escape') {
        e.stopPropagation(); e.preventDefault()
        closePalRef.current()
      }
    }
    el.addEventListener('keydown', handler, { capture: true })
    return () => el.removeEventListener('keydown', handler, { capture: true })
  }, [])

  const handleMount: OnMount = useCallback((ed) => {
    editorRef.current = ed
    monaco.editor.setTheme('quorum-typst')
    ed.addCommand(monaco.KeyCode.F1, () => {})
    onMountProp(ed)

    ed.onDidChangeModelContent(() => {
      onContentChange(ed.getValue())

      const pos = ed.getPosition()
      if (!pos) return
      const line   = ed.getModel()?.getLineContent(pos.lineNumber) ?? ''
      const before = line.slice(0, pos.column - 1)
      const match  = before.match(/\/(\w*)$/)

      if (match) {
        const slashIdx = before.length - match[0].length
        const prevChar = before[slashIdx - 1]
        if (prevChar && /[a-zA-Z0-9:_]/.test(prevChar)) { closePalette(); return }

        if (!slashPosRef.current || slashPosRef.current.lineNumber !== pos.lineNumber) {
          slashPosRef.current = { lineNumber: pos.lineNumber, column: pos.column - match[0].length }
        }

        const commands = filterCommands(match[1])
        if (commands.length === 0) { closePalette(); return }

        const pixelPos = ed.getScrolledVisiblePosition(pos)
        const rect     = ed.getDomNode()?.getBoundingClientRect()
        if (pixelPos && rect) {
          setPalette({ open: true, x: rect.left + pixelPos.left, y: rect.top + pixelPos.top + 22, commands, selectedIndex: 0 })
        }
      } else {
        if (paletteRef.current.open) closePalette()
      }
    })

    ed.onDidChangeCursorPosition(e => {
      const slash = slashPosRef.current
      if (!slash) return
      if (e.position.lineNumber !== slash.lineNumber || e.position.column < slash.column) closePalette()
    })
  }, [onMountProp, onContentChange, closePalette])

  useEffect(() => { editorRef.current?.updateOptions({ fontSize }) }, [fontSize])

  // Highlight comment ranges in the editor
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return

    const active = comments.filter(c => !c.resolved)

    let styleEl = document.getElementById('quorum-comment-styles') as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = 'quorum-comment-styles'
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = active
      .map(c => `.qc-${c.id} { background-color: ${c.authorColor}28; border-bottom: 2px solid ${c.authorColor}80; }`)
      .join('\n')

    const newDecorations = active
      .filter(c => !(c.range.startLineNumber === c.range.endLineNumber && c.range.startColumn === c.range.endColumn))
      .map(c => ({
        range: new monaco.Range(c.range.startLineNumber, c.range.startColumn, c.range.endLineNumber, c.range.endColumn),
        options: { inlineClassName: `qc-${c.id}` },
      }))

    decorationsRef.current = ed.deltaDecorations(decorationsRef.current, newDecorations)
  }, [comments])

  // Re-layout Monaco whenever the container is resized
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => { editorRef.current?.layout() })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}
    >
      <MonacoEditor
        height="100%"
        language={TYPST_LANGUAGE_ID}
        theme="quorum-typst"
        defaultValue=""
        onMount={handleMount}
        options={{
          fontSize,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
          fontLigatures: true,
          lineHeight: 22,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          padding: { top: 20, bottom: 20 },
          renderLineHighlight: 'gutter',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: false, indentation: true },
          lineNumbersMinChars: 3,
          overviewRulerLanes: 0,
          stickyScroll: { enabled: false },
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          acceptSuggestionOnEnter: 'off',
          tabCompletion: 'off',
          wordBasedSuggestions: 'off',
          parameterHints: { enabled: false },
          contextmenu: false,
          scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 },
        }}
      />
      <SlashCommandPalette {...palette} onSelect={doInsert} onClose={closePalette} />
    </div>
  )
}

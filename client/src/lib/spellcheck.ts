import * as monaco from 'monaco-editor'
import { TYPST_LANGUAGE_ID } from './typstLanguage'

/** Monarch token types (see typstLanguage.ts) that represent checkable prose,
 *  as opposed to code, math, comments, raw blocks, references, etc. */
const PROSE_TOKEN_TYPES = new Set(['', 'bold.typst', 'italic.typst'])

/** Product/technical names that would otherwise false-positive against the
 *  general English dictionary. */
const BUILT_IN_ALLOWLIST = ['typst', 'glyph', 'quorum', 'hocuspocus']

const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g

export interface SpellIssue {
  word: string
  lineNumber: number
  startColumn: number
  endColumn: number
}

export interface SpellChecker {
  correct(word: string): boolean
  suggest(word: string): string[]
}

let spellPromise: Promise<SpellChecker> | null = null

/** Lazily fetches the vendored en_US hunspell dictionary and builds an
 *  nspell instance. Cached — only loaded once per page session. */
export function loadSpellChecker(): Promise<SpellChecker> {
  if (!spellPromise) {
    spellPromise = (async () => {
      const [{ default: nspell }, aff, dic] = await Promise.all([
        import('nspell'),
        fetch('/dict/en.aff').then(r => r.text()),
        fetch('/dict/en.dic').then(r => r.text()),
      ])
      const spell = nspell(aff, dic)
      for (const word of BUILT_IN_ALLOWLIST) spell.add(word)
      return spell
    })()
  }
  return spellPromise
}

function isCheckable(word: string): boolean {
  if (word.length < 2) return false
  if (/^[A-Z]+$/.test(word)) return false // acronyms (PDF, URL, ...)
  return true
}

/** Scans the document's prose text (skipping code, math, comments, raw
 *  blocks, labels/refs, numbers) for words the dictionary doesn't recognize. */
export function findSpellIssues(spell: SpellChecker, text: string, extraDictionary: Set<string>): SpellIssue[] {
  const issues: SpellIssue[] = []
  const lines = text.split('\n')
  const tokensByLine = monaco.editor.tokenize(text, TYPST_LANGUAGE_ID)

  for (let i = 0; i < lines.length; i++) {
    const lineContent = lines[i]
    const tokens = tokensByLine[i] ?? []
    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t]
      if (!PROSE_TOKEN_TYPES.has(token.type)) continue
      let segStart = token.offset
      let segEnd = t + 1 < tokens.length ? tokens[t + 1].offset : lineContent.length
      if (token.type === 'bold.typst' || token.type === 'italic.typst') {
        // Strip the *…* or _..._ delimiters themselves.
        segStart += 1
        segEnd -= 1
      }
      if (segEnd <= segStart) continue

      const segment = lineContent.slice(segStart, segEnd)
      WORD_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = WORD_RE.exec(segment))) {
        const word = m[0]
        if (!isCheckable(word)) continue
        if (extraDictionary.has(word.toLowerCase())) continue
        if (spell.correct(word)) continue
        const startColumn = segStart + m.index + 1
        issues.push({ word, lineNumber: i + 1, startColumn, endColumn: startColumn + word.length })
      }
    }
  }
  return issues
}

// ── Quick-fix integration ──────────────────────────────────────────────────
// A single CodeActionProvider is registered for the language (Monaco
// providers are global per language id, not per editor instance — this app
// only ever shows one editor at a time, so a module-level "current state"
// holder is sufficient and avoids re-registering on every render).

const ADD_TO_DICTIONARY_COMMAND = 'quorum.spellcheck.addToDictionary'
const IGNORE_WORD_COMMAND = 'quorum.spellcheck.ignoreWord'

interface SpellController {
  issues: SpellIssue[]
  spell: SpellChecker | null
  onAddToDictionary: (word: string) => void
  onIgnoreWord: (word: string) => void
}

const controller: SpellController = {
  issues: [],
  spell: null,
  onAddToDictionary: () => {},
  onIgnoreWord: () => {},
}

export function updateSpellController(patch: Partial<SpellController>): void {
  Object.assign(controller, patch)
}

let registered = false

/** Idempotent — safe to call on every Editor mount. */
export function registerSpellCodeActions(): void {
  if (registered) return
  registered = true

  monaco.languages.registerCodeActionProvider(TYPST_LANGUAGE_ID, {
    provideCodeActions(model, range) {
      const issue = controller.issues.find(i =>
        i.lineNumber === range.startLineNumber &&
        range.startColumn <= i.endColumn && range.endColumn >= i.startColumn
      )
      if (!issue) return { actions: [], dispose() {} }

      const wordRange = new monaco.Range(issue.lineNumber, issue.startColumn, issue.lineNumber, issue.endColumn)
      const suggestions = (controller.spell?.suggest(issue.word) ?? []).slice(0, 5)

      const actions: monaco.languages.CodeAction[] = suggestions.map(s => ({
        title: `Change to “${s}”`,
        kind: 'quickfix',
        isPreferred: true,
        edit: {
          edits: [{
            resource: model.uri,
            textEdit: { range: wordRange, text: s },
            versionId: undefined,
          }],
        },
      }))

      actions.push({
        title: `Add “${issue.word}” to dictionary`,
        kind: 'quickfix',
        command: { id: ADD_TO_DICTIONARY_COMMAND, title: 'Add to dictionary', arguments: [issue.word] },
      })
      actions.push({
        title: `Ignore “${issue.word}” for this session`,
        kind: 'quickfix',
        command: { id: IGNORE_WORD_COMMAND, title: 'Ignore word', arguments: [issue.word] },
      })

      return { actions, dispose() {} }
    },
  })

  monaco.editor.registerCommand(ADD_TO_DICTIONARY_COMMAND, (_accessor, word: string) => {
    controller.onAddToDictionary(word)
  })
  monaco.editor.registerCommand(IGNORE_WORD_COMMAND, (_accessor, word: string) => {
    controller.onIgnoreWord(word)
  })
}

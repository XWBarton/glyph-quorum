import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, unlinkSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import * as Y from 'yjs'

const DATA_DIR  = join(process.cwd(), 'data')
const DOCS_DIR  = join(DATA_DIR, 'docs')
const PASSWORDS_FILE = join(DATA_DIR, 'passwords.json')
mkdirSync(DOCS_DIR, { recursive: true })

/** Persist Y.js document state to a binary file. */
export function saveDoc(docName: string, doc: Y.Doc): void {
  const state = Y.encodeStateAsUpdate(doc)
  writeFileSync(join(DOCS_DIR, `${docName}.bin`), Buffer.from(state))
}

/** Load previously saved Y.js state into a document. */
export function loadDoc(docName: string, doc: Y.Doc): void {
  const filePath = join(DOCS_DIR, `${docName}.bin`)
  if (existsSync(filePath)) {
    try {
      Y.applyUpdate(doc, readFileSync(filePath))
    } catch (e) {
      console.warn(`Failed to load doc "${docName}":`, e)
    }
  }
}

/** List all persisted document names. */
export function listDocs(): string[] {
  return readdirSync(DOCS_DIR)
    .filter(f => f.endsWith('.bin'))
    .map(f => f.slice(0, -4))
}

// ── Room passwords ────────────────────────────────────────────────────────────

function loadPasswords(): Record<string, string> {
  if (!existsSync(PASSWORDS_FILE)) return {}
  try { return JSON.parse(readFileSync(PASSWORDS_FILE, 'utf8')) } catch { return {} }
}

function hashPassword(pw: string): string {
  return createHash('sha256').update(pw).digest('hex')
}

export function isRoomProtected(docId: string): boolean {
  return docId in loadPasswords()
}

export function setRoomPassword(docId: string, password: string): void {
  const passwords = loadPasswords()
  passwords[docId] = hashPassword(password)
  writeFileSync(PASSWORDS_FILE, JSON.stringify(passwords))
}

/** Returns true if the room is unprotected, or if the password matches. */
export function checkRoomPassword(docId: string, password: string): boolean {
  const passwords = loadPasswords()
  if (!(docId in passwords)) return true
  return passwords[docId] === hashPassword(password)
}

/** Delete all persisted data for a room. */
export function deleteRoom(docId: string): void {
  // Document binary
  const binPath = join(DOCS_DIR, `${docId}.bin`)
  if (existsSync(binPath)) unlinkSync(binPath)

  // Assets directory
  const assetsPath = join(DATA_DIR, 'assets', docId)
  if (existsSync(assetsPath)) rmSync(assetsPath, { recursive: true, force: true })

  // Password entry
  const passwords = loadPasswords()
  if (docId in passwords) {
    delete passwords[docId]
    writeFileSync(PASSWORDS_FILE, JSON.stringify(passwords))
  }
}

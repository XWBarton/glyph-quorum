import { spawn } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

function findTypstBin(): string {
  try {
    const cmd = process.platform === 'win32' ? 'where typst' : 'which typst'
    const found = execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0]
    if (found && existsSync(found)) return found
  } catch {}

  const candidates: string[] =
    process.platform === 'win32'
      ? [
          `${process.env.LOCALAPPDATA}\\Programs\\typst\\typst.exe`,
          `${process.env.USERPROFILE}\\.cargo\\bin\\typst.exe`,
        ]
      : process.platform === 'darwin'
        ? [
            '/opt/homebrew/bin/typst',
            '/usr/local/bin/typst',
            `${process.env.HOME}/.cargo/bin/typst`,
          ]
        : [
            '/usr/bin/typst',
            '/usr/local/bin/typst',
            `${process.env.HOME}/.cargo/bin/typst`,
          ]

  return candidates.find(existsSync) ?? 'typst'
}

const TYPST_BIN = findTypstBin()

/** Returns the assets directory for a given room (created on demand). */
export function getAssetsDir(docId: string): string {
  const dir = join(process.cwd(), 'data', 'assets', docId)
  mkdirSync(dir, { recursive: true })
  return dir
}

export type CompileResult =
  | { ok: true; pdfBase64: string }
  | { ok: false; error: string }

export async function compileTypst(content: string, docId: string): Promise<CompileResult> {
  // Compile inside the room's assets dir so relative image paths resolve.
  const root = getAssetsDir(docId)
  const inputPath  = join(root, '_compile.typ')
  const outputPath = join(root, '_compile.pdf')

  writeFileSync(inputPath, content, 'utf8')

  return new Promise((resolve) => {
    const child = spawn(TYPST_BIN, [
      'compile', inputPath, outputPath,
      '--root', root,
      '--diagnostic-format', 'short',
    ])

    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    child.on('close', (code) => {
      try { unlinkSync(inputPath) } catch {}
      if (code === 0 && existsSync(outputPath)) {
        try {
          const pdfBase64 = readFileSync(outputPath).toString('base64')
          try { unlinkSync(outputPath) } catch {}
          resolve({ ok: true, pdfBase64 })
        } catch (e) {
          resolve({ ok: false, error: String(e) })
        }
      } else {
        try { if (existsSync(outputPath)) unlinkSync(outputPath) } catch {}
        resolve({ ok: false, error: stderr.trim() || `typst exited with code ${code}` })
      }
    })

    child.on('error', (err) => {
      try { if (existsSync(inputPath)) unlinkSync(inputPath) } catch {}
      resolve({ ok: false, error: `Failed to run typst: ${err.message}` })
    })
  })
}

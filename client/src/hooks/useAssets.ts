import { useState, useCallback } from 'react'

export interface Asset {
  name: string
  size: number
}

export function useAssets(docId: string) {
  const [assets, setAssets]     = useState<Asset[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res  = await fetch(`/api/rooms/${docId}/assets`)
      const data = await res.json()
      setAssets(data.files ?? [])
    } catch (e) {
      setError(`Failed to load assets: ${(e as Error).message}`)
    }
  }, [docId])

  const upload = useCallback(async (files: FileList) => {
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload  = e => resolve((e.target!.result as string).split(',')[1])
          reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
          reader.readAsDataURL(file)
        })
        const res = await fetch(`/api/rooms/${docId}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, data: base64 }),
        })
        if (!res.ok) {
          const msg = await res.text().catch(() => res.statusText)
          throw new Error(`Upload failed for ${file.name}: ${msg}`)
        }
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      await refresh()
    }
  }, [docId, refresh])

  const remove = useCallback(async (name: string) => {
    try {
      await fetch(`/api/rooms/${docId}/assets/${encodeURIComponent(name)}`, { method: 'DELETE' })
      await refresh()
    } catch (e) {
      setError(`Failed to delete: ${(e as Error).message}`)
    }
  }, [docId, refresh])

  return { assets, uploading, error, refresh, upload, remove }
}

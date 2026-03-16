import { Server } from '@hocuspocus/server'
import { loadDoc, saveDoc, checkRoomPassword } from './storage.js'

export const hocuspocus = Server.configure({
  async onLoadDocument({ document, documentName }) {
    loadDoc(documentName, document)
    return document
  },

  async onStoreDocument({ document, documentName }) {
    saveDoc(documentName, document)
  },

  async onConnect({ requestParameters, documentName }) {
    const user     = requestParameters.get('user') ?? 'Anonymous'
    const password = requestParameters.get('password') ?? ''
    if (!checkRoomPassword(documentName, password)) {
      throw new Error('Unauthorized')
    }
    console.log(`[quorum] user connected: ${user} → ${documentName}`)
  },

  async onDisconnect({ requestParameters }) {
    const user = requestParameters.get('user') ?? 'Anonymous'
    console.log(`[quorum] user disconnected: ${user}`)
  },
})

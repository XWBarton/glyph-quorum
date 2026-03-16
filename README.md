# Glyph Quorum

Real-time collaborative Typst editor. Multiple people edit the same document simultaneously, see each other's cursors, leave comments, and compile to PDF — all in the browser.

## Features

- **Live collaboration** — shared editing powered by Y.js and Hocuspocus; see every collaborator's cursor in real time
- **Typst compilation** — compile to PDF on the server; rendered preview updates as you type
- **Asset uploads** — drag images and files into the editor; they are stored per-room and available to your Typst document
- **Slash commands** — type `/` anywhere to open a command palette with headings, lists, tables, images, math, code blocks, and more
- **Comments** — select text and leave inline comments; resolve them when done
- **Change log** — per-room audit trail of every edit (who, what, when)
- **Password-protected rooms** — optionally lock a room with a password; the share link copies both the URL and the password
- **Room browser** — the join screen lists all rooms on the server with a lock icon for protected ones
- **Room deletion** — delete a room (and all its assets) from the toolbar
- **Zero-config deployment** — the WebSocket URL is derived from the page's own host at runtime, so it works behind Cloudflare Tunnel or any reverse proxy without any build-time configuration

## Port

The server listens on **port 3000** by default. Override with the `PORT` environment variable:

```
PORT=8080 node dist/index.js
```

## Install

### One-line (Linux / macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/XWBarton/glyph-quorum/main/install.sh | bash
```

This will:
1. Install Node.js 20 if not present (via `apt-get` on Linux or `brew` on macOS)
2. Install Typst if not present
3. Clone the repository into `./glyph-quorum`
4. Install dependencies and build
5. Start the server on port 3000

Open `http://localhost:3000` when it's running.

### Manual

Requirements: **Node.js 20+** and **Typst** on your PATH.

```bash
git clone https://github.com/XWBarton/glyph-quorum.git
cd glyph-quorum
npm install
npm run build
cd server
node dist/index.js
```

### Custom port

```bash
PORT=8080 node dist/index.js
```

### Behind a reverse proxy or Cloudflare Tunnel

No extra configuration needed. Point your tunnel or proxy at `localhost:3000` (or your custom port) and the client will automatically connect over `wss://` when served over HTTPS.

## Update

```bash
cd glyph-quorum
git pull --ff-only
npm install
npm run build
```

Then restart the server.

Or re-run the one-line installer — it detects the existing directory and updates it in place.

## Development

```bash
npm install
npm run dev
```

Runs the server on port 3000 and the Vite dev server on port 5173 (with HMR). Open `http://localhost:5173`.

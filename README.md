# P2P Whiteboard

Real-time collaborative whiteboard that runs entirely peer-to-peer in the browser using **WebRTC DataChannels**. The only server component is a thin WebSocket signaling server used to establish connections — after that, all drawing data flows directly between peers.

<p align="center">
  <em>Create a room → share the link → draw together</em>
</p>

---

## Features

| Feature                | Details                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| **Room management**    | Create a room (get a short code) or join via code / link                   |
| **Real-time drawing**  | Pen & eraser tools, 9 colors, 4 brush widths                               |
| **Live streaming**     | Stroke points are batched at ~30 fps and streamed to peers as you draw     |
| **Undo / Redo**        | Local undo/redo per peer (`Ctrl+Z` / `Ctrl+Y`), synced to others           |
| **Snapshot sync**      | New peers receive a full snapshot from the host, then live events          |
| **Host migration**     | If the host disconnects, the next peer automatically becomes host          |
| **Reconnection**       | Signaling client reconnects with exponential back-off                      |
| **Backpressure**       | DataChannel buffer checked before sending; messages dropped if full        |
| **Keyboard shortcuts** | `P` = pen, `E` = eraser, `Ctrl+Z` = undo, `Ctrl+Shift+Z` / `Ctrl+Y` = redo |

## Architecture

```
┌──────────┐   WebSocket    ┌──────────────────┐   WebSocket    ┌──────────┐
│  Peer A  │ ◄────────────► │  Signaling Server │ ◄────────────► │  Peer B  │
│ (Browser)│   (signaling    │   (Node.js :3001) │   (signaling    │ (Browser)│
└────┬─────┘   only)         └──────────────────┘   only)         └────┬─────┘
     │                                                                  │
     │              WebRTC DataChannel (P2P)                           │
     └────────────────────────────────────────────────────────────────┘
                       ▲ all drawing data flows here
```

### Key design decisions

| Decision                            | Rationale                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Snapshot + events** (hybrid sync) | New peers get a JSON snapshot of all current strokes from the host, then receive live events. Avoids replaying thousands of draw events and is simpler than pure event sourcing. |
| **JSON protocol**                   | Simple, debuggable, good enough for whiteboard data. MessagePack would save ~30% bandwidth but adds a dependency and complicates debugging.                                      |
| **Normalized coordinates (0-1)**    | Stroke points are stored as fractions of canvas size, so drawings look consistent across different screen resolutions.                                                           |
| **Local undo/redo**                 | Each peer tracks their own strokes. Undo removes the last stroke _you_ drew and notifies others. This avoids complex distributed undo and matches user expectations.             |
| **Mesh topology**                   | Every peer connects to every other peer. Fine for ≤10 users (typical for whiteboard sessions).                                                                                   |
| **Host role**                       | Room creator is the initial host. Host sends snapshots to new joiners. If host leaves, the remaining peer with the lowest ID takes over (deterministic, no election needed).     |

### Message protocol (v1)

All DataChannel messages are JSON with shape `{ v: 1, t: "<type>", d: <data> }`.

| Type            | Direction     | Payload                                     |
| --------------- | ------------- | ------------------------------------------- |
| `stroke-start`  | → peers       | `{ id, peerId, tool, color, width, point }` |
| `stroke-points` | → peers       | `{ id, points[] }` (batched ~30ms)          |
| `stroke-end`    | → peers       | `{ id }`                                    |
| `undo`          | → peers       | `{ strokeId }`                              |
| `redo`          | → peers       | `{ stroke }` (full data)                    |
| `clear`         | → peers       | `{}`                                        |
| `snapshot`      | host → joiner | `{ strokes[] }`                             |
| `snapshot-req`  | joiner → host | `{}`                                        |
| `ping` / `pong` | ↔             | `{}`                                        |

Version field `v` ensures forward compatibility — if a peer receives a message with an unknown version, it's silently dropped.

## Project structure

```
p2p-whiteboard-webrtc/
├── server/                     # Signaling server (Node.js + ws)
│   └── src/index.ts
├── client/                     # Frontend (Vite + React + TypeScript)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── protocol.ts    # Message types, encode/decode, versioning
│   │   │   ├── signaling.ts   # WebSocket client with reconnect
│   │   │   ├── peer.ts        # WebRTC PeerManager (mesh connections)
│   │   │   └── canvas.ts      # Canvas rendering (Bézier smoothing)
│   │   ├── hooks/
│   │   │   └── useWhiteboard.ts  # Central state: strokes, undo/redo, sync
│   │   ├── components/
│   │   │   ├── Lobby.tsx       # Room create/join UI
│   │   │   ├── Toolbar.tsx     # Drawing tools, colors, actions
│   │   │   └── Whiteboard.tsx  # Canvas + pointer events
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   └── vite.config.ts
├── tests/e2e/smoke.spec.ts    # Playwright smoke tests
├── playwright.config.ts
├── .eslintrc.cjs
├── .prettierrc
└── package.json               # Root scripts (dev, lint, test)
```

## Quick start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

### Install

```bash
# Install root tooling (concurrently, eslint, prettier, playwright)
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

### Development

```bash
# Start both signaling server and Vite dev server
npm run dev
```

This runs:

- **Signaling server** on `ws://localhost:3001`
- **Vite dev server** on `http://localhost:5173`

Open two browser tabs at `http://localhost:5173`. Create a room in one tab, copy the link or code, and join from the other tab.

### Tests

```bash
# Unit tests (protocol)
npm test

# E2E smoke tests (requires dev servers running, or let Playwright start them)
npm run test:e2e
```

### Lint & Format

```bash
npm run lint
npm run format
```

### Build for production

```bash
npm run build
# Output in client/dist/
```

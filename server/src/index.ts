import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT) || 3001;
const MAX_ROOM_SIZE = 10;

interface Peer {
  id: string;
  ws: WebSocket;
  roomId: string | null;
}

interface Room {
  id: string;
  hostId: string;
  peers: Map<string, Peer>;
}

const rooms = new Map<string, Room>();
const peers = new Map<WebSocket, Peer>();

function generateId(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastToRoom(room: Room, msg: unknown, excludeId?: string): void {
  for (const [id, peer] of room.peers) {
    if (id !== excludeId) {
      send(peer.ws, msg);
    }
  }
}

function findPeerById(id: string): Peer | undefined {
  for (const peer of peers.values()) {
    if (peer.id === id) return peer;
  }
  return undefined;
}

function handleDisconnect(peer: Peer): void {
  if (!peer.roomId) return;
  const room = rooms.get(peer.roomId);
  if (!room) return;

  room.peers.delete(peer.id);

  if (room.peers.size === 0) {
    rooms.delete(peer.roomId);
    console.log(`[room:${peer.roomId}] Deleted (empty)`);
    return;
  }

  broadcastToRoom(room, { type: 'peer-left', peerId: peer.id });

  if (room.hostId === peer.id) {
    const newHostId = Array.from(room.peers.keys()).sort()[0];
    room.hostId = newHostId;
    broadcastToRoom(room, { type: 'host-changed', hostId: newHostId });
    console.log(`[room:${peer.roomId}] Host migrated to ${newHostId}`);
  }

  console.log(`[room:${peer.roomId}] Peer ${peer.id} left (${room.peers.size} remaining)`);
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws: WebSocket) => {
  const peerId = generateId(12);
  const peer: Peer = { id: peerId, ws, roomId: null };
  peers.set(ws, peer);

  send(ws, { type: 'welcome', peerId });

  ws.on('message', (raw: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'create': {
        if (peer.roomId) {
          handleDisconnect(peer);
          peer.roomId = null;
        }

        let roomId = msg.roomId;
        if (!roomId) {
          do {
            roomId = generateId(6);
          } while (rooms.has(roomId));
        } else if (rooms.has(roomId)) {
          send(ws, { type: 'error', message: 'Room already exists' });
          return;
        }

        const room: Room = { id: roomId, hostId: peerId, peers: new Map() };
        room.peers.set(peerId, peer);
        rooms.set(roomId, room);
        peer.roomId = roomId;

        send(ws, { type: 'created', roomId, peerId, isHost: true });
        console.log(`[room:${roomId}] Created by ${peerId}`);
        break;
      }

      case 'join': {
        const room = rooms.get(msg.roomId);
        if (!room) {
          send(ws, { type: 'error', message: 'Room not found' });
          return;
        }
        if (room.peers.size >= MAX_ROOM_SIZE) {
          send(ws, { type: 'error', message: 'Room is full' });
          return;
        }

        if (peer.roomId) {
          handleDisconnect(peer);
        }

        room.peers.set(peerId, peer);
        peer.roomId = msg.roomId;

        const existingPeerIds = Array.from(room.peers.keys()).filter((id) => id !== peerId);
        send(ws, {
          type: 'joined',
          roomId: msg.roomId,
          peerId,
          peers: existingPeerIds,
          hostId: room.hostId,
          isHost: false,
        });

        broadcastToRoom(room, { type: 'peer-joined', peerId }, peerId);
        console.log(`[room:${msg.roomId}] Peer ${peerId} joined (${room.peers.size} total)`);
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice': {
        const targetPeer = findPeerById(msg.to);
        if (targetPeer) {
          send(targetPeer.ws, { ...msg, from: peerId });
        }
        break;
      }

      default:
        send(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    handleDisconnect(peer);
    peers.delete(ws);
  });

  ws.on('error', () => {
    handleDisconnect(peer);
    peers.delete(ws);
  });
});

console.log(`✓ Signaling server listening on ws://localhost:${PORT}`);

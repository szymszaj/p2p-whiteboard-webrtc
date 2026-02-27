export const PROTOCOL_VERSION = 1;

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  peerId: string;
  tool: 'pen' | 'eraser';
  color: string;
  width: number;
  points: Point[];
}

// ─── P2P DataChannel messages ────────────────────────────────────────────────

export type P2PMessage =
  | { v: number; t: 'stroke'; d: Stroke }
  | {
      v: number;
      t: 'stroke-start';
      d: {
        id: string;
        peerId: string;
        tool: 'pen' | 'eraser';
        color: string;
        width: number;
        point: Point;
      };
    }
  | { v: number; t: 'stroke-points'; d: { id: string; points: Point[] } }
  | { v: number; t: 'stroke-end'; d: { id: string } }
  | { v: number; t: 'undo'; d: { strokeId: string } }
  | { v: number; t: 'redo'; d: { stroke: Stroke } }
  | { v: number; t: 'clear'; d: Record<string, never> }
  | { v: number; t: 'snapshot-req'; d: Record<string, never> }
  | { v: number; t: 'snapshot'; d: { strokes: Stroke[] } }
  | { v: number; t: 'ping'; d: Record<string, never> }
  | { v: number; t: 'pong'; d: Record<string, never> };

export type SignalingMessage =
  | { type: 'welcome'; peerId: string }
  | { type: 'create'; roomId?: string }
  | { type: 'join'; roomId: string }
  | { type: 'created'; roomId: string; peerId: string; isHost: boolean }
  | {
      type: 'joined';
      roomId: string;
      peerId: string;
      peers: string[];
      hostId: string;
      isHost: boolean;
    }
  | { type: 'peer-joined'; peerId: string }
  | { type: 'peer-left'; peerId: string }
  | { type: 'host-changed'; hostId: string }
  | { type: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: 'error'; message: string };

export const MAX_MESSAGE_SIZE = 64 * 1024;

export const MAX_BUFFER_SIZE = MAX_MESSAGE_SIZE * 10;

export function encodeMessage(msg: P2PMessage): string {
  return JSON.stringify(msg);
}

export function decodeMessage(data: string): P2PMessage | null {
  try {
    const msg = JSON.parse(data);
    if (typeof msg !== 'object' || msg === null) return null;
    if (!('v' in msg) || !('t' in msg)) return null;

    if (msg.v !== PROTOCOL_VERSION) {
      console.warn(
        `[protocol] Version mismatch: expected v${PROTOCOL_VERSION}, got v${msg.v}. Message dropped.`,
      );
      return null;
    }
    return msg as P2PMessage;
  } catch {
    return null;
  }
}

type MessageDataMap = {
  [M in P2PMessage as M['t']]: M['d'];
};

export function createMessage<T extends keyof MessageDataMap>(
  type: T,
  data: MessageDataMap[T],
): P2PMessage {
  return { v: PROTOCOL_VERSION, t: type, d: data } as unknown as P2PMessage;
}

export function generateId(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

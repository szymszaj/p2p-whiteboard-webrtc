import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  encodeMessage,
  decodeMessage,
  createMessage,
  generateId,
} from '../protocol';
import type { Stroke, P2PMessage } from '../protocol';

const sampleStroke: Stroke = {
  id: 'stroke-1',
  peerId: 'peer-abc',
  tool: 'pen',
  color: '#ff0000',
  width: 3,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.3, y: 0.4 },
    { x: 0.5, y: 0.6 },
  ],
};

describe('protocol', () => {
  describe('encodeMessage / decodeMessage round-trip', () => {
    it('round-trips a stroke message', () => {
      const msg = createMessage('stroke', sampleStroke);
      const encoded = encodeMessage(msg);
      const decoded = decodeMessage(encoded);
      expect(decoded).toEqual(msg);
    });

    it('round-trips a stroke-start message', () => {
      const msg = createMessage('stroke-start', {
        id: 's1',
        peerId: 'p1',
        tool: 'eraser' as const,
        color: '#000',
        width: 8,
        point: { x: 0.5, y: 0.5 },
      });
      const encoded = encodeMessage(msg);
      const decoded = decodeMessage(encoded);
      expect(decoded).toEqual(msg);
    });

    it('round-trips a stroke-points message', () => {
      const msg = createMessage('stroke-points', {
        id: 's1',
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.3, y: 0.4 },
        ],
      });
      expect(decodeMessage(encodeMessage(msg))).toEqual(msg);
    });

    it('round-trips a stroke-end message', () => {
      const msg = createMessage('stroke-end', { id: 's1' });
      expect(decodeMessage(encodeMessage(msg))).toEqual(msg);
    });

    it('round-trips an undo message', () => {
      const msg = createMessage('undo', { strokeId: 'stroke-1' });
      expect(decodeMessage(encodeMessage(msg))).toEqual(msg);
    });

    it('round-trips a redo message', () => {
      const msg = createMessage('redo', { stroke: sampleStroke });
      expect(decodeMessage(encodeMessage(msg))).toEqual(msg);
    });

    it('round-trips a clear message', () => {
      const msg = createMessage('clear', {} as Record<string, never>);
      expect(decodeMessage(encodeMessage(msg))).toEqual(msg);
    });

    it('round-trips a snapshot message with strokes', () => {
      const msg = createMessage('snapshot', { strokes: [sampleStroke] });
      const decoded = decodeMessage(encodeMessage(msg));
      expect(decoded).toEqual(msg);
      expect((decoded as any).d.strokes).toHaveLength(1);
    });

    it('round-trips an empty snapshot', () => {
      const msg = createMessage('snapshot', { strokes: [] });
      expect(decodeMessage(encodeMessage(msg))).toEqual(msg);
    });

    it('round-trips ping/pong', () => {
      const ping = createMessage('ping', {} as Record<string, never>);
      const pong = createMessage('pong', {} as Record<string, never>);
      expect(decodeMessage(encodeMessage(ping))).toEqual(ping);
      expect(decodeMessage(encodeMessage(pong))).toEqual(pong);
    });
  });

  describe('decodeMessage — error cases', () => {
    it('returns null for invalid JSON', () => {
      expect(decodeMessage('not json at all')).toBeNull();
    });

    it('returns null for JSON that is not an object', () => {
      expect(decodeMessage('"just a string"')).toBeNull();
      expect(decodeMessage('42')).toBeNull();
      expect(decodeMessage('null')).toBeNull();
    });

    it('returns null when version field is missing', () => {
      expect(decodeMessage(JSON.stringify({ t: 'ping', d: {} }))).toBeNull();
    });

    it('returns null when type field is missing', () => {
      expect(decodeMessage(JSON.stringify({ v: 1, d: {} }))).toBeNull();
    });

    it('returns null for wrong protocol version', () => {
      const msg = JSON.stringify({ v: 999, t: 'ping', d: {} });
      expect(decodeMessage(msg)).toBeNull();
    });

    it('returns null for empty object', () => {
      expect(decodeMessage(JSON.stringify({}))).toBeNull();
    });
  });

  describe('createMessage', () => {
    it('stamps the current protocol version', () => {
      const msg = createMessage('ping', {} as Record<string, never>);
      expect(msg.v).toBe(PROTOCOL_VERSION);
    });

    it('sets the correct type', () => {
      const msg = createMessage('clear', {} as Record<string, never>);
      expect(msg.t).toBe('clear');
    });

    it('embeds the data payload', () => {
      const msg = createMessage('stroke', sampleStroke) as Extract<P2PMessage, { t: 'stroke' }>;
      expect(msg.d.id).toBe('stroke-1');
      expect(msg.d.points).toHaveLength(3);
    });
  });

  describe('generateId', () => {
    it('generates an ID of the requested length', () => {
      expect(generateId(6)).toHaveLength(6);
      expect(generateId(12)).toHaveLength(12);
      expect(generateId(1)).toHaveLength(1);
    });

    it('uses default length of 8', () => {
      expect(generateId()).toHaveLength(8);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 200 }, () => generateId()));
      expect(ids.size).toBe(200);
    });

    it('only contains safe characters (no ambiguous chars)', () => {
      for (let i = 0; i < 50; i++) {
        const id = generateId(20);
        expect(id).not.toMatch(/[0OlI1]/);
      }
    });
  });

  describe('serialization', () => {
    it('encodes to reasonable JSON size', () => {
      const msg = createMessage('stroke', sampleStroke);
      const encoded = encodeMessage(msg);
      expect(encoded.length).toBeLessThan(1024);
    });

    it('encodes empty snapshot compactly', () => {
      const msg = createMessage('snapshot', { strokes: [] });
      const encoded = encodeMessage(msg);
      expect(encoded.length).toBeLessThan(50);
    });
  });
});

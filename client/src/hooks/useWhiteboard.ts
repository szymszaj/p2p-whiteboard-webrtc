import { useState, useCallback, useRef, useEffect } from 'react';
import type { PeerManager } from '../lib/peer';
import type { Stroke, Point, P2PMessage } from '../lib/protocol';
import { createMessage, generateId } from '../lib/protocol';

export interface WhiteboardTools {
  tool: 'pen' | 'eraser';
  color: string;
  width: number;
}

export function useWhiteboard(peerManager: PeerManager | null) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tools, setTools] = useState<WhiteboardTools>({
    tool: 'pen',
    color: '#000000',
    width: 3,
  });
  const [peers, setPeers] = useState<string[]>([]);

  const strokesRef = useRef<Stroke[]>([]);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<Stroke[]>([]);
  const inProgressRef = useRef<Map<string, Stroke>>(new Map());

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    if (!peerManager) return;

    const unsub = peerManager.onMessage((_peerId: string, msg: P2PMessage) => {
      switch (msg.t) {
        case 'stroke': {
          setStrokes((prev) => [...prev, msg.d]);
          break;
        }

        case 'stroke-start': {
          const stroke: Stroke = {
            id: msg.d.id,
            peerId: msg.d.peerId,
            tool: msg.d.tool,
            color: msg.d.color,
            width: msg.d.width,
            points: [msg.d.point],
          };
          inProgressRef.current.set(msg.d.id, stroke);
          setStrokes((prev) => [...prev, stroke]);
          break;
        }

        case 'stroke-points': {
          const existing = inProgressRef.current.get(msg.d.id);
          if (existing) {
            existing.points.push(...msg.d.points);
            setStrokes((prev) => prev.map((s) => (s.id === msg.d.id ? { ...existing } : s)));
          }
          break;
        }

        case 'stroke-end': {
          inProgressRef.current.delete(msg.d.id);
          break;
        }

        case 'undo': {
          setStrokes((prev) => prev.filter((s) => s.id !== msg.d.strokeId));
          break;
        }

        case 'redo': {
          setStrokes((prev) => [...prev, msg.d.stroke]);
          break;
        }

        case 'clear': {
          setStrokes([]);
          break;
        }

        case 'snapshot-req': {
          peerManager.sendTo(_peerId, createMessage('snapshot', { strokes: strokesRef.current }));
          break;
        }

        case 'snapshot': {
          setStrokes(msg.d.strokes);
          break;
        }
      }
    });

    peerManager.setCallbacks({
      onPeerConnected: (peerId: string) => {
        setPeers(peerManager.connectedPeerIds);
        if (peerManager.isHost) {
          peerManager.sendTo(peerId, createMessage('snapshot', { strokes: strokesRef.current }));
        }
      },
      onPeerDisconnected: () => {
        setPeers(peerManager.connectedPeerIds);
      },
      onHostChanged: () => {},
    });

    return unsub;
  }, [peerManager]);

  const startStroke = useCallback(
    (point: Point): string | null => {
      if (!peerManager) return null;

      const id = generateId();
      const stroke: Stroke = {
        id,
        peerId: peerManager.localId,
        tool: tools.tool,
        color: tools.color,
        width: tools.width,
        points: [point],
      };

      inProgressRef.current.set(id, stroke);
      setStrokes((prev) => [...prev, stroke]);

      peerManager.broadcast(
        createMessage('stroke-start', {
          id,
          peerId: peerManager.localId,
          tool: tools.tool,
          color: tools.color,
          width: tools.width,
          point,
        }),
      );

      return id;
    },
    [peerManager, tools],
  );

  const addPoints = useCallback(
    (strokeId: string, points: Point[]): void => {
      const stroke = inProgressRef.current.get(strokeId);
      if (!stroke) return;

      stroke.points.push(...points);
      setStrokes((prev) => prev.map((s) => (s.id === strokeId ? { ...stroke } : s)));

      peerManager?.broadcast(createMessage('stroke-points', { id: strokeId, points }));
    },
    [peerManager],
  );

  const endStroke = useCallback(
    (strokeId: string): void => {
      const stroke = inProgressRef.current.get(strokeId);
      if (!stroke) return;
      inProgressRef.current.delete(strokeId);

      undoStackRef.current.push(strokeId);
      redoStackRef.current = [];

      peerManager?.broadcast(createMessage('stroke-end', { id: strokeId }));
    },
    [peerManager],
  );

  const undo = useCallback(() => {
    const strokeId = undoStackRef.current.pop();
    if (!strokeId) return;

    const stroke = strokesRef.current.find((s) => s.id === strokeId);
    if (stroke) {
      redoStackRef.current.push(stroke);
    }

    setStrokes((prev) => prev.filter((s) => s.id !== strokeId));
    peerManager?.broadcast(createMessage('undo', { strokeId }));
  }, [peerManager]);

  const redo = useCallback(() => {
    const stroke = redoStackRef.current.pop();
    if (!stroke) return;

    undoStackRef.current.push(stroke.id);
    setStrokes((prev) => [...prev, stroke]);
    peerManager?.broadcast(createMessage('redo', { stroke }));
  }, [peerManager]);

  const clear = useCallback(() => {
    setStrokes([]);
    undoStackRef.current = [];
    redoStackRef.current = [];
    peerManager?.broadcast(createMessage('clear', {} as Record<string, never>));
  }, [peerManager]);

  return {
    strokes,
    tools,
    setTools,
    peers,
    startStroke,
    addPoints,
    endStroke,
    undo,
    redo,
    clear,
  };
}

import { useState, useCallback, useRef, useEffect } from 'react';
import { PeerManager } from './lib/peer';
import { Lobby } from './components/Lobby';
import { Whiteboard } from './components/Whiteboard';
import { Toolbar } from './components/Toolbar';
import { useWhiteboard } from './hooks/useWhiteboard';

const SIGNALING_URL = `ws://${window.location.hostname}:3001`;

type AppState = 'lobby' | 'connecting' | 'room';

export function App() {
  const hashRoomId = window.location.hash.slice(1);
  const [appState, setAppState] = useState<AppState>(hashRoomId ? 'connecting' : 'lobby');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const peerManagerRef = useRef<PeerManager | null>(null);
  const [peerManager, setPeerManager] = useState<PeerManager | null>(null);

  const wb = useWhiteboard(peerManager);

  const handleCreate = useCallback(async () => {
    setError('');
    setAppState('connecting');
    try {
      const pm = new PeerManager(SIGNALING_URL);
      peerManagerRef.current = pm;
      await pm.connect();
      const result = await pm.createRoom();
      setRoomId(result.roomId);
      window.location.hash = result.roomId;
      setPeerManager(pm);
      setAppState('room');
    } catch {
      setError('Failed to create room. Is the signaling server running?');
      setAppState('lobby');
    }
  }, []);

  const handleJoin = useCallback(async (id: string) => {
    setError('');
    setAppState('connecting');
    try {
      const pm = new PeerManager(SIGNALING_URL);
      peerManagerRef.current = pm;
      await pm.connect();
      await pm.joinRoom(id);
      setRoomId(id);
      window.location.hash = id;
      setPeerManager(pm);
      setAppState('room');
    } catch (e: any) {
      setError(e?.message || 'Failed to join room');
      setAppState('lobby');
    }
  }, []);

  const handleLeave = useCallback(() => {
    peerManagerRef.current?.disconnect();
    peerManagerRef.current = null;
    setPeerManager(null);
    setRoomId('');
    window.location.hash = '';
    setAppState('lobby');
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (appState !== 'room') return;

      const mod = e.ctrlKey || e.metaKey;

      // Undo
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        wb.undo();
      }
      // Redo
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        wb.redo();
      }
      if (!mod) {
        if (e.key === 'p') wb.setTools({ ...wb.tools, tool: 'pen' });
        if (e.key === 'e') wb.setTools({ ...wb.tools, tool: 'eraser' });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appState, wb]);

  useEffect(() => {
    if (hashRoomId) {
      handleJoin(hashRoomId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      {appState === 'lobby' && (
        <Lobby onCreateRoom={handleCreate} onJoinRoom={handleJoin} error={error} />
      )}

      {appState === 'connecting' && (
        <div className="connecting">
          <div className="spinner" />
          <p>Connecting…</p>
        </div>
      )}

      {appState === 'room' && (
        <>
          <Toolbar
            roomId={roomId}
            peers={wb.peers}
            isHost={peerManager?.isHost ?? false}
            tools={wb.tools}
            onToolsChange={wb.setTools}
            onUndo={wb.undo}
            onRedo={wb.redo}
            onClear={wb.clear}
            onLeave={handleLeave}
          />
          <Whiteboard
            strokes={wb.strokes}
            tool={wb.tools.tool}
            onStartStroke={wb.startStroke}
            onAddPoints={wb.addPoints}
            onEndStroke={wb.endStroke}
          />
        </>
      )}
    </div>
  );
}

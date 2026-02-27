import { useState, useEffect } from 'react';

interface LobbyProps {
  onCreateRoom: () => void;
  onJoinRoom: (roomId: string) => void;
  error: string;
}

export function Lobby({ onCreateRoom, onJoinRoom, error }: LobbyProps) {
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) setJoinCode(hash);
  }, []);

  return (
    <div className="lobby">
      <h1>P2P Whiteboard</h1>
      <p className="subtitle">Real-time collaborative drawing over WebRTC</p>

      {error && <div className="error">{error}</div>}

      <div className="lobby-actions">
        <button className="btn btn-primary" onClick={onCreateRoom}>
          Create Room
        </button>

        <div className="divider">or join an existing room</div>

        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault();
            const code = joinCode.trim();
            if (code) onJoinRoom(code);
          }}
        >
          <input
            type="text"
            placeholder="Enter room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            autoFocus
          />
          <button className="btn btn-secondary" type="submit" disabled={!joinCode.trim()}>
            Join
          </button>
        </form>
      </div>
    </div>
  );
}

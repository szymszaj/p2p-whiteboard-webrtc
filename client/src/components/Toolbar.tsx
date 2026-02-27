import type { WhiteboardTools } from '../hooks/useWhiteboard';

interface ToolbarProps {
  roomId: string;
  peers: string[];
  isHost: boolean;
  tools: WhiteboardTools;
  onToolsChange: (tools: WhiteboardTools) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onLeave: () => void;
}

const COLORS = [
  '#000000',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ffffff',
];

const WIDTHS = [2, 4, 8, 16];

export function Toolbar({
  roomId,
  peers,
  isHost,
  tools,
  onToolsChange,
  onUndo,
  onRedo,
  onClear,
  onLeave,
}: ToolbarProps) {
  const shareUrl = `${window.location.origin}${window.location.pathname}#${roomId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {});
  };

  return (
    <div className="toolbar">
      {/* Room info */}
      <div className="toolbar-section">
        <span className="room-info">
          Room: <strong>{roomId}</strong>
          <button className="btn-icon" title="Copy invite link" onClick={copyLink}>
            📋
          </button>
        </span>
        <span className="peer-count">
          {peers.length + 1} online{isHost ? ' · host' : ''}
        </span>
      </div>

      <div className="toolbar-section toolbar-tools">
        <button
          className={`btn-tool ${tools.tool === 'pen' ? 'active' : ''}`}
          onClick={() => onToolsChange({ ...tools, tool: 'pen' })}
          title="Pen (P)"
        >
          ✏️
        </button>
        <button
          className={`btn-tool ${tools.tool === 'eraser' ? 'active' : ''}`}
          onClick={() => onToolsChange({ ...tools, tool: 'eraser' })}
          title="Eraser (E)"
        >
          🧹
        </button>

        <div className="separator" />

        {COLORS.map((c) => (
          <button
            key={c}
            className={`btn-color ${tools.color === c ? 'active' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => onToolsChange({ ...tools, color: c })}
            title={c}
          />
        ))}

        <div className="separator" />

        {WIDTHS.map((w) => (
          <button
            key={w}
            className={`btn-width ${tools.width === w ? 'active' : ''}`}
            onClick={() => onToolsChange({ ...tools, width: w })}
            title={`${w}px`}
          >
            <span className="width-dot" style={{ width: w + 2, height: w + 2 }} />
          </button>
        ))}
      </div>

      <div className="toolbar-section">
        <button className="btn-tool" onClick={onUndo} title="Undo (Ctrl+Z)">
          ↩️
        </button>
        <button className="btn-tool" onClick={onRedo} title="Redo (Ctrl+Y)">
          ↪️
        </button>
        <button className="btn-tool" onClick={onClear} title="Clear canvas">
          🗑️
        </button>
        <div className="separator" />
        <button className="btn btn-danger btn-sm" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}

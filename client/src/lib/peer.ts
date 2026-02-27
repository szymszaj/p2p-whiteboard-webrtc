import { SignalingClient } from './signaling';
import type { P2PMessage } from './protocol';
import { encodeMessage, decodeMessage, MAX_BUFFER_SIZE } from './protocol';

interface PeerConnection {
  id: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  bufferedMessages: string[];
  connected: boolean;
}

export type P2PHandler = (peerId: string, msg: P2PMessage) => void;

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

export class PeerManager {
  private signaling: SignalingClient;
  private connections = new Map<string, PeerConnection>();
  private handlers = new Set<P2PHandler>();

  private _localId = '';
  private _roomId = '';
  private _isHost = false;
  private _hostId = '';

  private _onPeerConnected?: (peerId: string) => void;
  private _onPeerDisconnected?: (peerId: string) => void;
  private _onHostChanged?: (hostId: string) => void;

  constructor(signalingUrl: string) {
    this.signaling = new SignalingClient(signalingUrl);
  }

  get localId(): string {
    return this._localId;
  }
  get roomId(): string {
    return this._roomId;
  }
  get isHost(): boolean {
    return this._isHost;
  }
  get hostId(): string {
    return this._hostId;
  }
  get connectedPeerIds(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, c]) => c.connected)
      .map(([id]) => id);
  }

  setCallbacks(cbs: {
    onPeerConnected?: (peerId: string) => void;
    onPeerDisconnected?: (peerId: string) => void;
    onHostChanged?: (hostId: string) => void;
  }): void {
    this._onPeerConnected = cbs.onPeerConnected;
    this._onPeerDisconnected = cbs.onPeerDisconnected;
    this._onHostChanged = cbs.onHostChanged;
  }

  async connect(): Promise<void> {
    await this.signaling.connect();
    this.signaling.onMessage((msg) => this.handleSignaling(msg));
  }

  createRoom(): Promise<{ roomId: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout creating room')), 10_000);
      const unsub = this.signaling.onMessage((msg) => {
        if (msg.type === 'created') {
          clearTimeout(timeout);
          this._localId = msg.peerId;
          this._roomId = msg.roomId;
          this._isHost = true;
          this._hostId = msg.peerId;
          unsub();
          resolve({ roomId: msg.roomId });
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          unsub();
          reject(new Error(msg.message));
        }
      });
      this.signaling.send({ type: 'create' });
    });
  }

  joinRoom(roomId: string): Promise<{ peers: string[] }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout joining room')), 10_000);
      const unsub = this.signaling.onMessage((msg) => {
        if (msg.type === 'joined') {
          clearTimeout(timeout);
          this._localId = msg.peerId;
          this._roomId = msg.roomId;
          this._isHost = false;
          this._hostId = msg.hostId;
          unsub();

          for (const peerId of msg.peers) {
            this.createPeerConnection(peerId, true);
          }
          resolve({ peers: msg.peers });
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          unsub();
          reject(new Error(msg.message));
        }
      });
      this.signaling.send({ type: 'join', roomId });
    });
  }

  disconnect(): void {
    for (const conn of this.connections.values()) {
      conn.dc?.close();
      conn.pc.close();
    }
    this.connections.clear();
    this.signaling.disconnect();
  }

  onMessage(handler: P2PHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  broadcast(msg: P2PMessage): void {
    const data = encodeMessage(msg);
    for (const conn of this.connections.values()) {
      if (conn.connected && conn.dc) {
        this.sendRaw(conn.dc, data);
      } else {
        conn.bufferedMessages.push(data);
      }
    }
  }

  sendTo(peerId: string, msg: P2PMessage): void {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    const data = encodeMessage(msg);
    if (conn.connected && conn.dc) {
      this.sendRaw(conn.dc, data);
    } else {
      conn.bufferedMessages.push(data);
    }
  }

  private handleSignaling(msg: any): void {
    switch (msg.type) {
      case 'welcome':
        if (!this._localId) this._localId = msg.peerId;
        break;

      case 'peer-joined':
        break;

      case 'peer-left':
        this.removePeer(msg.peerId);
        break;

      case 'host-changed':
        this._hostId = msg.hostId;
        this._isHost = msg.hostId === this._localId;
        this._onHostChanged?.(msg.hostId);
        break;

      case 'offer':
        this.handleOffer(msg.from, msg.sdp);
        break;

      case 'answer':
        this.handleAnswer(msg.from, msg.sdp);
        break;

      case 'ice':
        this.handleIceCandidate(msg.from, msg.candidate);
        break;
    }
  }

  private createPeerConnection(peerId: string, isInitiator: boolean): PeerConnection {
    const existing = this.connections.get(peerId);
    if (existing) {
      existing.dc?.close();
      existing.pc.close();
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const conn: PeerConnection = {
      id: peerId,
      pc,
      dc: null,
      bufferedMessages: [],
      connected: false,
    };
    this.connections.set(peerId, conn);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signaling.send({
          type: 'ice',
          to: peerId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(peerId);
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('whiteboard', { ordered: true });
      conn.dc = dc;
      this.setupDataChannel(dc, conn);

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          this.signaling.send({
            type: 'offer',
            to: peerId,
            sdp: pc.localDescription!,
          });
        })
        .catch((err) => console.error('[peer] Failed to create offer:', err));
    } else {
      pc.ondatachannel = (e) => {
        conn.dc = e.channel;
        this.setupDataChannel(e.channel, conn);
      };
    }

    return conn;
  }

  private setupDataChannel(dc: RTCDataChannel, conn: PeerConnection): void {
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      conn.connected = true;
      for (const msg of conn.bufferedMessages) {
        this.sendRaw(dc, msg);
      }
      conn.bufferedMessages = [];
      this._onPeerConnected?.(conn.id);
    };

    dc.onclose = () => {
      conn.connected = false;
      this._onPeerDisconnected?.(conn.id);
    };

    dc.onerror = (e) => {
      console.error(`[peer:${conn.id}] DataChannel error:`, e);
    };

    dc.onmessage = (e) => {
      const msg = decodeMessage(e.data as string);
      if (msg) {
        for (const handler of this.handlers) {
          handler(conn.id, msg);
        }
      }
    };
  }

  private async handleOffer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const conn = this.createPeerConnection(peerId, false);
    try {
      await conn.pc.setRemoteDescription(sdp);
      const answer = await conn.pc.createAnswer();
      await conn.pc.setLocalDescription(answer);
      this.signaling.send({
        type: 'answer',
        to: peerId,
        sdp: conn.pc.localDescription!,
      });
    } catch (err) {
      console.error('[peer] Failed to handle offer:', err);
    }
  }

  private async handleAnswer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    try {
      await conn.pc.setRemoteDescription(sdp);
    } catch (err) {
      console.error('[peer] Failed to handle answer:', err);
    }
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    try {
      await conn.pc.addIceCandidate(candidate);
    } catch (err) {
      // Non-fatal: ICE candidates can arrive before remote description is set
      console.warn('[peer] ICE candidate error (may be harmless):', err);
    }
  }

  private sendRaw(dc: RTCDataChannel, data: string): void {
    if (dc.readyState !== 'open') return;

    if (dc.bufferedAmount > MAX_BUFFER_SIZE) {
      console.warn('[peer] Backpressure: dropping message (buffer full)');
      return;
    }

    try {
      dc.send(data);
    } catch (e) {
      console.error('[peer] Failed to send:', e);
    }
  }

  private removePeer(peerId: string): void {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    conn.dc?.close();
    conn.pc.close();
    this.connections.delete(peerId);
    this._onPeerDisconnected?.(peerId);
  }
}

const WS_URL = (import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000")
  .replace(/^http/, "ws") + "/ws";

export type WsEventType =
  | "init"
  | "message_received"
  | "iff_received"
  | "revocation_applied"
  | "mqtt_status"
  | "log";

export interface WsEvent {
  type: WsEventType;
  [key: string]: unknown;
}

type Listener = (event: WsEvent) => void;

class SisdefWs {
  private ws: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.ws = new WebSocket(WS_URL);

    this.ws.onmessage = (e) => {
      try {
        const event: WsEvent = JSON.parse(e.data);
        this.listeners.forEach((l) => l(event));
      } catch {
        // ignore malformed
      }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => this.connect(), 3000);
  }
}

export const sisdefWs = new SisdefWs();

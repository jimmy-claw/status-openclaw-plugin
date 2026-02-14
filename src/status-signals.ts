/**
 * WebSocket connection to the status-backend /signals endpoint.
 * Receives real-time events (new messages, contact requests, etc.).
 */

import WebSocket from "ws";
import type { StatusSignalEvent } from "./types.js";

export type SignalHandler = (event: StatusSignalEvent) => void;

export interface SignalConnection {
  close(): void;
  readonly connected: boolean;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Connect to the status-backend signals WebSocket with auto-reconnect.
 */
export function connectSignals(opts: {
  port: number;
  onSignal: SignalHandler;
  onError?: (err: Error) => void;
  onClose?: () => void;
  log?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  abortSignal?: AbortSignal;
}): SignalConnection {
  const { port, onSignal, onError, onClose, log, abortSignal } = opts;
  const url = `ws://127.0.0.1:${port}/signals`;

  let ws: WebSocket | null = null;
  let isConnected = false;
  let closed = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (closed || abortSignal?.aborted) return;

    ws = new WebSocket(url);

    ws.on("open", () => {
      isConnected = true;
      reconnectAttempts = 0;
      log?.info(`Signals WebSocket connected to ${url}`);
    });

    ws.on("message", (data: WebSocket.RawData) => {
      try {
        const raw = data.toString("utf-8");
        const parsed = JSON.parse(raw) as StatusSignalEvent;
        if (parsed && typeof parsed.type === "string") {
          onSignal(parsed);
        }
      } catch (err) {
        log?.warn(`Failed to parse signal: ${err}`);
      }
    });

    ws.on("error", (err: Error) => {
      log?.error(`Signals WebSocket error: ${err.message}`);
      onError?.(err);
    });

    ws.on("close", () => {
      isConnected = false;
      if (!closed && !abortSignal?.aborted) {
        const backoff = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
        reconnectAttempts++;
        log?.warn(`Signals WebSocket closed, reconnecting in ${backoff}ms...`);
        reconnectTimer = setTimeout(connect, backoff);
      } else {
        onClose?.();
      }
    });
  }

  // Abort signal handling
  abortSignal?.addEventListener("abort", () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  });

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      ws = null;
      isConnected = false;
    },
    get connected() {
      return isConnected;
    },
  };
}

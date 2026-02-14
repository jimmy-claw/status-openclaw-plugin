/**
 * HTTP API wrapper for status-backend.
 *
 * REST endpoints: POST http://localhost:PORT/statusgo/<Method>
 * JSON-RPC:       POST http://localhost:PORT/statusgo/CallRPC
 */

const DEFAULT_TIMEOUT = 30_000;

/** Base URL for a given port. */
function baseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/**
 * Call a REST endpoint on status-backend.
 */
async function callRest(
  port: number,
  method: string,
  body: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<unknown> {
  const url = `${baseUrl(port)}/statusgo/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`status-backend ${method}: HTTP ${response.status} — ${text}`);
  }
  return response.json();
}

/**
 * Make a JSON-RPC call via status-backend's CallRPC endpoint.
 */
export async function callRPC(
  port: number,
  method: string,
  params: unknown[] = [],
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<unknown> {
  const url = `${baseUrl(port)}/statusgo/CallRPC`;
  const body = { jsonrpc: "2.0", id: Date.now(), method, params };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`status-backend RPC ${method}: HTTP ${response.status} — ${text}`);
  }

  const json = (await response.json()) as {
    result?: unknown;
    error?: { code: number; message: string };
  };

  if (json.error) {
    throw new Error(`status-backend RPC ${method}: ${json.error.message} (${json.error.code})`);
  }

  return json.result;
}

/** Initialize the status-backend application. */
export async function initializeApplication(port: number, dataDir: string): Promise<unknown> {
  return callRest(port, "InitializeApplication", { dataDir });
}

/** Log in to a Status account. */
export async function loginAccount(
  port: number,
  keyUID: string,
  password: string,
): Promise<unknown> {
  return callRest(port, "LoginAccount", { keyUID, password }, 60_000);
}

/** Send a one-to-one message. */
export async function sendOneToOneMessage(
  port: number,
  chatId: string,
  message: string,
): Promise<unknown> {
  return callRPC(port, "wakuext_sendOneToOneMessage", [{ id: chatId, message }]);
}

/** Get the contact list. */
export async function getContacts(port: number): Promise<unknown> {
  return callRPC(port, "wakuext_contacts", []);
}

/** Get messages for a specific chat. */
export async function getChatMessages(
  port: number,
  chatId: string,
  cursor = "",
  limit = 20,
): Promise<unknown> {
  return callRPC(port, "wakuext_chatMessages", [chatId, cursor, limit]);
}

/** Get the list of active chats. */
export async function getActiveChats(port: number): Promise<unknown> {
  return callRPC(port, "wakuext_activeChats", []);
}

/** Get account settings (includes public key). */
export async function getSettings(port: number): Promise<Record<string, unknown>> {
  return callRPC(port, "settings_getSettings", []) as Promise<Record<string, unknown>>;
}

/** Check if the backend is healthy. */
export async function healthCheck(port: number): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl(port)}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

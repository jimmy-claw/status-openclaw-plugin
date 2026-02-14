import type { OpenClawConfig } from "openclaw/plugin-sdk";

export interface StatusAccountConfig {
  enabled?: boolean;
  name?: string;
  /** HTTP port of status-backend (default: 21405) */
  port?: number;
  /** Key UID of the Status account */
  keyUID?: string;
  /** Account password */
  password?: string;
  /** Data directory path */
  dataDir?: string;
  /** DM policy */
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  /** Allowed sender public keys */
  allowFrom?: Array<string | number>;
}

export interface ResolvedStatusAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  port: number;
  keyUID: string;
  password: string;
  dataDir: string;
  publicKey: string;
  config: StatusAccountConfig;
}

const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_PORT = 21405;
const DEFAULT_DATA_DIR = "~/.status-backend/data";

/**
 * List all configured Status account IDs.
 */
export function listStatusAccountIds(cfg: OpenClawConfig): string[] {
  const statusCfg = (cfg.channels as Record<string, unknown> | undefined)?.status as
    | StatusAccountConfig
    | undefined;
  if (statusCfg?.keyUID) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return [];
}

/**
 * Get the default account ID.
 */
export function resolveDefaultStatusAccountId(cfg: OpenClawConfig): string {
  const ids = listStatusAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

/**
 * Resolve a Status account from config.
 */
export function resolveStatusAccount(opts: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedStatusAccount {
  const accountId = opts.accountId ?? DEFAULT_ACCOUNT_ID;
  const statusCfg = (opts.cfg.channels as Record<string, unknown> | undefined)?.status as
    | StatusAccountConfig
    | undefined;

  const enabled = statusCfg?.enabled !== false;
  const keyUID = statusCfg?.keyUID ?? "";
  const password = statusCfg?.password ?? "";
  const configured = Boolean(keyUID.trim() && password.trim());
  const port = statusCfg?.port ?? DEFAULT_PORT;
  const dataDir = statusCfg?.dataDir ?? DEFAULT_DATA_DIR;

  return {
    accountId,
    name: statusCfg?.name?.trim() || undefined,
    enabled,
    configured,
    port,
    keyUID,
    password,
    dataDir,
    publicKey: "", // Set at runtime after login
    config: statusCfg ?? {},
  };
}

/** Signal event from the status-backend WebSocket. */
export interface StatusSignalEvent {
  type: string;
  event: Record<string, unknown>;
}

/** A Status chat message. */
export interface StatusMessage {
  id: string;
  chatId: string;
  from: string;
  text: string;
  timestamp: number;
  contentType: number;
}

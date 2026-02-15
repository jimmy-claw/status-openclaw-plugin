/**
 * Status Messenger channel plugin.
 * Implements ChannelPlugin<ResolvedStatusAccount> following the OpenClaw plugin SDK.
 */

import {
  DEFAULT_ACCOUNT_ID,
  formatPairingApproveHint,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";
import type { ResolvedStatusAccount, StatusMessage } from "./types.js";
import { statusChannelConfigSchema } from "./config-schema.js";
import { getStatusRuntime } from "./runtime.js";
import {
  listStatusAccountIds,
  resolveDefaultStatusAccountId,
  resolveStatusAccount,
} from "./types.js";
import {
  callRPC,
  initializeApplication,
  loginAccount,
  sendOneToOneMessage,
  getSettings,
  healthCheck,
  getActiveChats,
  getChatMessages,
} from "./status-api.js";
import { connectSignals, type SignalConnection } from "./status-signals.js";

/** Active signal connections per account. */
const activeConnections = new Map<string, SignalConnection>();

/** Cached public keys per account. */
const publicKeys = new Map<string, string>();

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const statusPlugin: ChannelPlugin<ResolvedStatusAccount> = {
  id: "status",
  meta: {
    id: "status",
    label: "Status",
    selectionLabel: "Status Messenger",
    docsPath: "/channels/status",
    docsLabel: "status",
    blurb: "Decentralized messaging via Status (Waku) network",
    order: 100,
  },
  capabilities: {
    chatTypes: ["direct"],
    media: false,
  },
  reload: { configPrefixes: ["channels.status"] },
  configSchema: statusChannelConfigSchema,

  config: {
    listAccountIds: (cfg) => listStatusAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveStatusAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultStatusAccountId(cfg),
    isConfigured: (account) => account.configured,
    isEnabled: (account) => account.enabled,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      publicKey: publicKeys.get(account.accountId) || undefined,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveStatusAccount({ cfg, accountId }).config.allowFrom ?? []).map(String),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((e) => String(e).trim()).filter(Boolean),
  },

  pairing: {
    idLabel: "statusPubkey",
    normalizeAllowEntry: (entry) => entry.trim().toLowerCase(),
    notifyApproval: async ({ id }) => {
      // Could send a Status message to the approved contact
    },
  },

  security: {
    resolveDmPolicy: ({ account }) => ({
      policy: account.config.dmPolicy ?? "pairing",
      allowFrom: account.config.allowFrom ?? [],
      policyPath: "channels.status.dmPolicy",
      allowFromPath: "channels.status.allowFrom",
      approveHint: formatPairingApproveHint("status"),
      normalizeEntry: (raw) => raw.trim().toLowerCase(),
    }),
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async ({ to, text, accountId }) => {
      const runtime = getStatusRuntime();
      const cfg = runtime.config.loadConfig();
      const account = resolveStatusAccount({ cfg, accountId });

      await sendOneToOneMessage(account.port, to, text);

      return {
        channel: "status" as const,
        to,
        messageId: `status-${Date.now()}`,
      };
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      publicKey: publicKeys.get(account.accountId) || null,
      running: runtime?.running ?? false,
      connected: activeConnections.get(account.accountId)?.connected ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const { port, keyUID, password, dataDir } = account;

      ctx.log?.info(`[${account.accountId}] Starting Status channel (port: ${port})`);

      // Check if status-backend is healthy
      const healthy = await healthCheck(port);
      if (!healthy) {
        throw new Error(
          `status-backend not reachable on port ${port}. ` +
          `Ensure status-backend and status-login services are running.`,
        );
      }

      // Wait for the backend to be logged in (status-login.service handles this)
      ctx.log?.info(`[${account.accountId}] Waiting for backend to be ready...`);
      let ready = false;
      for (let i = 0; i < 12; i++) {
        try {
          const chats = await getActiveChats(port);
          if (Array.isArray(chats)) {
            ready = true;
            ctx.log?.info(`[${account.accountId}] Backend ready (${(chats as any[]).length} chats)`);
            break;
          }
        } catch { /* not ready yet */ }
        await delay(5_000);
      }
      if (!ready) {
        ctx.log?.warn(`[${account.accountId}] Backend not fully ready after 60s, starting polling anyway`);
      }

      // Get public key from settings
      try {
        const settings = await getSettings(port);
        const pubkey = (settings as any)?.["public-key"] ?? "";
        if (pubkey) {
          publicKeys.set(account.accountId, pubkey);
          ctx.log?.info(`[${account.accountId}] Public key: ${pubkey.slice(0, 20)}...`);
        }
      } catch (err) {
        ctx.log?.warn(`[${account.accountId}] Could not get settings: ${err}`);
      }

      const runtime = getStatusRuntime();
      const selfPubkey = publicKeys.get(account.accountId) ?? "";

      // Track seen message IDs to avoid duplicates
      const seenMessages = new Set<string>();
      let pollStopped = false;

      // Helper: process an inbound message
      const handleMsg = async (msg: any) => {
        const msgId: string = msg.id ?? msg.ID ?? "";
        if (msgId && seenMessages.has(msgId)) return;
        if (msgId) seenMessages.add(msgId);

        const from: string = msg.from ?? msg.source ?? "";
        const text: string = msg.text ?? msg.parsedText ?? "";
        const timestamp: number = msg.timestamp ?? msg.clock ?? Date.now();

        // Skip messages from self
        if (selfPubkey && from === selfPubkey) return;
        // Skip empty messages
        if (!text.trim()) return;

        ctx.log?.info(`[${account.accountId}] Inbound from ${from.slice(0, 16)}...: ${text.slice(0, 80)}`);

        // Inject as system event into main session — the agent will see it and can reply
        try {
          const senderLabel = from.slice(0, 12) + "...";
          const groupName = (msg as any)._groupChatName;
          const prefix = groupName
            ? `[Status group "${groupName}" from ${senderLabel}]`
            : `[Status DM from ${senderLabel}]`;
          runtime.system.enqueueSystemEvent(
            `${prefix} ${text}`,
            { sessionKey: "agent:main:main" }
          );
          ctx.log?.info(`[${account.accountId}] Enqueued system event for Status DM`);
        } catch (err: any) {
          ctx.log?.error(`[${account.accountId}] Failed to enqueue system event: ${err.message}`);
        }
      };

      // Connect to signals WebSocket (may work once Waku fully bootstraps)
      const signalConn = connectSignals({
        port,
        onSignal: async (signal) => {
          if (signal.type === "messages.new") {
            const event = signal.event;
            const messages = (event?.messages ?? []) as any[];
            for (const msg of messages) {
              if (msg) await handleMsg(msg);
            }
          }
        },
        onError: (err) => {
          ctx.log?.error(`[${account.accountId}] Signal error: ${err.message}`);
        },
        log: ctx.log
          ? { info: ctx.log.info, warn: ctx.log.warn, error: ctx.log.error }
          : undefined,
        abortSignal: ctx.abortSignal,
      });

      activeConnections.set(account.accountId, signalConn);

      // Message polling fallback (since WebSocket signals may not fire until
      // startMessenger completes, which can hang on arm64)
      const POLL_INTERVAL_MS = 15_000;
      // Use timestamp-based tracking per chat to avoid race conditions
      const lastSeenTimestamp = new Map<string, number>();

      const pollMessages = async () => {
        try {
          const chats = (await getActiveChats(port)) as any[];
          if (!Array.isArray(chats)) return;

          let foundNew = false;
          for (const chat of chats) {
            if (chat.chatType !== 1 && chat.chatType !== 3) continue;
            const chatId = chat.id ?? "";
            if (!chatId) continue;

            const lastTs = lastSeenTimestamp.get(chatId) ?? Date.now();
            if (!lastSeenTimestamp.has(chatId)) lastSeenTimestamp.set(chatId, lastTs);

            const result = (await getChatMessages(port, chatId, "", 10)) as any;
            const messages = result?.messages ?? [];

            let maxTs = lastTs;
            for (const msg of messages) {
              if (!msg) continue;
              const ts: number = msg.timestamp ?? msg.clock ?? 0;
              if (ts <= lastTs) continue;
              if (ts > maxTs) maxTs = ts;

              // Skip if already handled via seenMessages (WebSocket)
              const msgId: string = msg.id ?? "";
              if (msgId && seenMessages.has(msgId)) continue;

              // Tag group chats
              if (chat.chatType === 3) {
                (msg as any)._groupChatName = chat.name ?? "group";
                (msg as any)._groupChatId = chatId;
              }
              ctx.log?.info(`[${account.accountId}] Poll found msg in ${chat.chatType === 3 ? 'group "' + (chat.name ?? '') + '"' : 'DM'} ts=${ts}`);
              foundNew = true;
              await handleMsg(msg);
            }
            lastSeenTimestamp.set(chatId, maxTs);
          }

          if (!foundNew) {
            // Quiet poll — don't spam logs
          }
        } catch (err: any) {
          ctx.log?.warn?.(`[${account.accountId}] Poll error: ${err.message}`);
        }
      };

      // Seed seen messages + per-chat timestamps from recent history
      try {
        const chats = (await getActiveChats(port)) as any[];
        if (Array.isArray(chats)) {
          for (const chat of chats) {
            if (chat.chatType !== 1 && chat.chatType !== 3) continue;
            const chatId = chat.id ?? "";
            if (!chatId) continue;
            const result = (await getChatMessages(port, chatId, "", 10)) as any;
            let maxTs = 0;
            for (const msg of (result?.messages ?? [])) {
              if (msg?.id) seenMessages.add(msg.id);
              const ts: number = msg?.timestamp ?? msg?.clock ?? 0;
              if (ts > maxTs) maxTs = ts;
            }
            if (maxTs > 0) lastSeenTimestamp.set(chatId, maxTs);
          }
        }
        ctx.log?.info(`[${account.accountId}] Seeded ${seenMessages.size} msg IDs, ${lastSeenTimestamp.size} chat timestamps`);
      } catch {
        // Non-fatal
      }

      const pollTimer = setInterval(async () => {
        if (!pollStopped) await pollMessages();
      }, POLL_INTERVAL_MS);

      ctx.setStatus({
        accountId: account.accountId,
        running: true,
        connected: true,
        lastStartAt: Date.now(),
        publicKey: selfPubkey || null,
      });

      ctx.log?.info(`[${account.accountId}] Status channel started (WS + polling every ${POLL_INTERVAL_MS / 1000}s)`);

      // Return cleanup
      return {
        stop: () => {
          pollStopped = true;
          clearInterval(pollTimer);
          signalConn.close();
          activeConnections.delete(account.accountId);
          ctx.log?.info(`[${account.accountId}] Status channel stopped`);
        },
      };
    },
  },
};

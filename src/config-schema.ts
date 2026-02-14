/**
 * Zod schema for the `channels.status` configuration block.
 */

import { buildChannelConfigSchema } from "openclaw/plugin-sdk";
import { z } from "zod";

const allowFromEntry = z.union([z.string(), z.number()]);

export const StatusConfigSchema = z.object({
  /** Account name (optional display label) */
  name: z.string().optional(),

  /** Whether this channel is enabled */
  enabled: z.boolean().optional(),

  /** HTTP port of the status-backend API */
  port: z.number().default(21405).optional(),

  /** Key UID of the Status account (hex string) */
  keyUID: z.string().optional(),

  /** Account password */
  password: z.string().optional(),

  /** Path to the status-backend data directory */
  dataDir: z.string().default("~/.status-backend/data").optional(),

  /** DM access policy */
  dmPolicy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional(),

  /** Public keys allowed to send DMs (for allowlist policy) */
  allowFrom: z.array(allowFromEntry).optional(),
});

export type StatusConfig = z.infer<typeof StatusConfigSchema>;

export const statusChannelConfigSchema = buildChannelConfigSchema(StatusConfigSchema);

/**
 * Command router for wallet bot.
 * Parses !commands from chat messages and dispatches to handlers.
 */

import { handleBalanceCommand } from "./balance.js";
import { handleTipCommand } from "./tip.js";
import { handleRegisterCommand, handleWhoisCommand } from "./registry.js";
import {
  handleSignersCommand,
  handleAddSignerCommand,
  handleRemoveSignerCommand,
  handleThresholdCommand,
  handleApproveCommand,
  handleRejectCommand,
  handleProposalsCommand,
} from "./governance.js";

export interface CommandResult {
  command: string;
  response: string;
}

/**
 * Check if a message is a command (starts with !)
 */
export function isCommand(text: string): boolean {
  return text.trim().startsWith("!");
}

/**
 * Parse and execute a command. Returns null if not a command.
 */
export async function handleCommand(text: string): Promise<CommandResult | null> {
  const trimmed = text.trim();
  if (!isCommand(trimmed)) return null;

  const [cmd, ...argParts] = trimmed.slice(1).split(/\s+/);
  const args = argParts.join(" ");

  switch (cmd.toLowerCase()) {
    case "balance":
      return {
        command: "balance",
        response: await handleBalanceCommand(args || undefined),
      };

    case "tip":
      return {
        command: "tip",
        response: await handleTipCommand(args),
      };

    case "register":
      return {
        command: "register",
        response: handleRegisterCommand(args, "unknown"), // sender pubkey injected by caller
      };

    case "whois":
      return {
        command: "whois",
        response: handleWhoisCommand(args),
      };

    case "signers":
      return { command: "signers", response: handleSignersCommand() };

    case "addsigner":
      return { command: "addsigner", response: handleAddSignerCommand(args, "unknown") };

    case "removesigner":
      return { command: "removesigner", response: handleRemoveSignerCommand(args, "unknown") };

    case "threshold":
      return { command: "threshold", response: handleThresholdCommand(args, "unknown") };

    case "approve":
      return { command: "approve", response: handleApproveCommand(args, "unknown") };

    case "reject":
      return { command: "reject", response: handleRejectCommand(args, "unknown") };

    case "proposals":
      return { command: "proposals", response: handleProposalsCommand() };

    case "help":
      return {
        command: "help",
        response: [
          "🦞 Jimmy's Wallet Bot — Commands:",
          "",
          "💰 Wallet:",
          "  !balance [address] — Check Sepolia ETH balance",
          "  !tip <@pubkey|address|ENS> <amount> — Send ETH",
          "  !register <wallet_address> — Link wallet to Status identity",
          "  !whois <@pubkey> — Look up registered wallet",
          "",
          "🔐 Governance:",
          "  !signers — List current signers",
          "  !addsigner <@pubkey> — Add a signer (admin)",
          "  !removesigner <@pubkey> — Remove a signer (admin)",
          "  !threshold [amount] — View/set approval threshold",
          "  !proposals — List pending proposals",
          "  !approve <id> — Approve a proposal",
          "  !reject <id> — Reject a proposal",
          "",
          "Tips ≤ threshold go through instantly.",
          "Tips > threshold need signer approval!",
        ].join("\n"),
      };

    default:
      return {
        command: cmd,
        response: `Unknown command: !${cmd}. Try !help`,
      };
  }
}

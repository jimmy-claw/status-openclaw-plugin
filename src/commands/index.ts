/**
 * Command router for wallet bot.
 * Parses !commands from chat messages and dispatches to handlers.
 */

import { handleBalanceCommand } from "./balance.js";
import { handleTipCommand } from "./tip.js";
import { handleRegisterCommand, handleWhoisCommand } from "./registry.js";

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

    case "help":
      return {
        command: "help",
        response: [
          "🦞 Jimmy's Wallet Bot — Commands:",
          "",
          "!register <wallet_address> — Link your ETH wallet to your Status identity",
          "!whois <@pubkey> — Look up someone's registered wallet",
          "!balance [address] — Check Sepolia ETH balance",
          "!tip <@pubkey|address|ENS> <amount> — Send Sepolia ETH (max 0.01)",
          "!help — Show this message",
          "",
          "Coming soon: !signers, !approve",
        ].join("\n"),
      };

    default:
      return {
        command: cmd,
        response: `Unknown command: !${cmd}. Try !help`,
      };
  }
}

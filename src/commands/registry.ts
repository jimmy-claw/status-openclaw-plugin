/**
 * Wallet registry — maps Status pubkeys to ETH wallet addresses.
 * Storage: simple JSON file on disk.
 * 
 * Commands:
 *   !register <wallet_address>  — Register your wallet (sender's pubkey → address)
 *   !whois <@pubkey>            — Look up registered wallet for a pubkey
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

const REGISTRY_PATH = process.env.WALLET_REGISTRY_PATH ||
  "/home/vpavlin/.openclaw/workspace/status-openclaw-plugin/wallet-registry.json";

export interface WalletEntry {
  address: string;
  registeredAt: string;
  displayName?: string;
}

export type WalletRegistry = Record<string, WalletEntry>; // pubkey → entry

function loadRegistry(): WalletRegistry {
  if (!existsSync(REGISTRY_PATH)) return {};
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveRegistry(registry: WalletRegistry): void {
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

/**
 * Register a wallet address for a Status pubkey.
 */
export function registerWallet(
  pubkey: string,
  address: string,
  displayName?: string
): string {
  if (!address.match(/^0x[0-9a-fA-F]{40}$/)) {
    return `❌ Invalid ETH address: ${address}`;
  }

  const registry = loadRegistry();
  const existing = registry[pubkey];

  registry[pubkey] = {
    address,
    registeredAt: new Date().toISOString(),
    displayName,
  };
  saveRegistry(registry);

  if (existing) {
    return `✅ Wallet updated!\n\nOld: ${existing.address}\nNew: ${address}\n\nNow !tip @you will send to ${address}`;
  }
  return `✅ Wallet registered!\n\nPubkey: ${pubkey.slice(0, 12)}...${pubkey.slice(-8)}\nWallet: ${address}\n\nNow !tip @you will send to ${address}`;
}

/**
 * Look up a wallet address for a Status pubkey.
 */
export function lookupWallet(pubkey: string): WalletEntry | null {
  const registry = loadRegistry();
  return registry[pubkey] || null;
}

/**
 * Resolve a tip target — check registry first, fall back to raw address/ENS.
 */
export function resolveRecipient(target: string): { address: string; source: string } | null {
  // If it's a Status pubkey (starts with 0x04, 130+ hex chars)
  const cleanTarget = target.replace(/^@/, "");
  if (cleanTarget.startsWith("0x04") && cleanTarget.length >= 130) {
    const entry = lookupWallet(cleanTarget);
    if (entry) {
      return { address: entry.address, source: "registry" };
    }
    return null; // Not registered
  }

  // If it's an ETH address
  if (cleanTarget.match(/^0x[0-9a-fA-F]{40}$/)) {
    return { address: cleanTarget, source: "direct" };
  }

  // ENS
  if (cleanTarget.endsWith(".eth")) {
    return { address: cleanTarget, source: "ens" };
  }

  return null;
}

/**
 * Handle !register command.
 */
export function handleRegisterCommand(args: string, senderPubkey: string): string {
  const address = args.trim().split(/\s+/)[0];
  if (!address) {
    return "Usage: !register <your_eth_wallet_address>\nExample: !register 0x5Aba88F1cB8e1DE63Fa19B02137fBe4d06225576";
  }
  return registerWallet(senderPubkey, address);
}

/**
 * Handle !whois command.
 */
export function handleWhoisCommand(args: string): string {
  const target = args.trim().replace(/^@/, "");
  if (!target) {
    return "Usage: !whois <@pubkey>\nLooks up the registered wallet for a Status user.";
  }

  const entry = lookupWallet(target);
  if (!entry) {
    return `No wallet registered for ${target.slice(0, 12)}...${target.slice(-8)}\nThey can register with: !register <wallet_address>`;
  }

  return `Wallet for ${target.slice(0, 12)}...${target.slice(-8)}:\n${entry.address}${entry.displayName ? ` (${entry.displayName})` : ""}\nRegistered: ${entry.registeredAt}`;
}

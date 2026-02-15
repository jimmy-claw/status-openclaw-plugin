// Wallet RPC helper wrapping status-backend CallRPC

import { RpcResponse, ChainInfo, AccountInfo, RpcProvider } from "./types.js";

const STATUS_BACKEND_URL =
  process.env.STATUS_BACKEND_URL ||
  "http://127.0.0.1:21405/statusgo/CallRPC";

let rpcIdCounter = 1;

/**
 * Call a status-backend RPC method via the CallRPC HTTP endpoint.
 */
export async function callRPC<T = unknown>(
  method: string,
  params: unknown[] = []
): Promise<T> {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: rpcIdCounter++,
    method,
    params,
  });

  const res = await fetch(STATUS_BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });

  if (!res.ok) {
    throw new Error(`RPC HTTP error ${res.status}: ${await res.text()}`);
  }

  const text = await res.text();
  // status-backend may return double-encoded JSON
  let data: RpcResponse<T>;
  try {
    const parsed = JSON.parse(text);
    data = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch {
    throw new Error(`Failed to parse RPC response: ${text.slice(0, 200)}`);
  }

  if (data.error) {
    throw new Error(`RPC error [${data.error.code}]: ${data.error.message}`);
  }

  return data.result as T;
}

/**
 * Initialize the wallet — call wallet_startWallet.
 */
export async function startWallet(): Promise<void> {
  await callRPC("wallet_startWallet");
}

/**
 * Get all Ethereum chains configured in status-backend.
 */
export async function getChains(): Promise<ChainInfo[]> {
  const result = await callRPC<ChainInfo[]>("wallet_getEthereumChains");
  return result ?? [];
}

/**
 * Get all accounts from status-backend.
 */
export async function getAccounts(): Promise<AccountInfo[]> {
  return callRPC<AccountInfo[]>("accounts_getAccounts");
}

/**
 * Resolve an ENS name to an address (mainnet only).
 */
export async function resolveENS(name: string): Promise<string> {
  const address = await callRPC<string>("ens_addressOf", [1, name]);
  if (!address || address === "0x0000000000000000000000000000000000000000") {
    throw new Error(`ENS name "${name}" could not be resolved`);
  }
  return address;
}

/**
 * Configure RPC providers for a specific chain.
 */
export async function setChainRpcProviders(
  chainId: number,
  providers: RpcProvider[]
): Promise<void> {
  await callRPC("wallet_setChainUserRpcProviders", [chainId, providers]);
}

/**
 * Resolve an address or ENS name to a hex address.
 */
export async function resolveAddress(addressOrENS: string): Promise<string> {
  if (addressOrENS.endsWith(".eth")) {
    return resolveENS(addressOrENS);
  }
  if (!addressOrENS.startsWith("0x") || addressOrENS.length !== 42) {
    throw new Error(`Invalid address: ${addressOrENS}`);
  }
  return addressOrENS;
}

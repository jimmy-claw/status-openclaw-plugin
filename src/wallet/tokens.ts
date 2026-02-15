// Token lookup and discovery

import { callRPC } from "./rpc.js";
import { Token } from "./types.js";

let tokenCache: Token[] | null = null;

/**
 * Fetch all tokens from status-backend.
 * Results are cached after first call.
 */
export async function getAllTokens(
  forceRefresh = false
): Promise<Token[]> {
  if (tokenCache && !forceRefresh) return tokenCache;

  const result = await callRPC<Token[]>("wallet_getAllTokens");
  tokenCache = result ?? [];
  return tokenCache;
}

/**
 * Find tokens by symbol (case-insensitive).
 */
export async function findTokenBySymbol(
  symbol: string,
  chainId?: number
): Promise<Token[]> {
  const tokens = await getAllTokens();
  const upperSymbol = symbol.toUpperCase();

  return tokens.filter(
    (t) =>
      t.symbol?.toUpperCase() === upperSymbol &&
      (chainId === undefined || t.chainId === chainId)
  );
}

/**
 * Find tokens by name (partial, case-insensitive).
 */
export async function findTokenByName(
  name: string,
  chainId?: number
): Promise<Token[]> {
  const tokens = await getAllTokens();
  const lowerName = name.toLowerCase();

  return tokens.filter(
    (t) =>
      t.name?.toLowerCase().includes(lowerName) &&
      (chainId === undefined || t.chainId === chainId)
  );
}

/**
 * Get token by contract address.
 */
export async function findTokenByAddress(
  address: string,
  chainId?: number
): Promise<Token | undefined> {
  const tokens = await getAllTokens();
  const lowerAddr = address.toLowerCase();

  return tokens.find(
    (t) =>
      t.address?.toLowerCase() === lowerAddr &&
      (chainId === undefined || t.chainId === chainId)
  );
}

/**
 * Get popular/well-known tokens for a chain.
 */
export async function getPopularTokens(
  chainId: number,
  limit = 20
): Promise<Token[]> {
  const tokens = await getAllTokens();
  const POPULAR = [
    "ETH", "WETH", "USDC", "USDT", "DAI", "WBTC", "UNI",
    "LINK", "AAVE", "SNT", "MATIC", "OP", "ARB",
  ];

  const chainTokens = tokens.filter((t) => t.chainId === chainId);
  const popular = chainTokens.filter((t) =>
    POPULAR.includes(t.symbol?.toUpperCase())
  );

  return popular.slice(0, limit);
}

/**
 * Clear the token cache.
 */
export function clearTokenCache(): void {
  tokenCache = null;
}

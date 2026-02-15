// Balance fetching and formatting

import { callRPC, getChains } from "./rpc.js";
import { KNOWN_CHAINS } from "./types.js";

export interface FormattedBalance {
  chain: string;
  chainId: number;
  symbol: string;
  balance: string;
  rawBalance: string;
}

/**
 * Fetch wallet balances for given addresses across all chains.
 * @param addresses - Wallet addresses to check
 * @param forceRefresh - Force refresh from network (default: false)
 */
export async function getBalances(
  addresses: string[],
  forceRefresh = false
): Promise<unknown> {
  return callRPC("wallet_fetchOrGetCachedWalletBalances", [
    addresses,
    forceRefresh,
  ]);
}

/**
 * Get balances for a single address, formatted for display.
 */
export async function getFormattedBalances(
  address: string,
  forceRefresh = false
): Promise<FormattedBalance[]> {
  const raw = await getBalances([address], forceRefresh);
  const results: FormattedBalance[] = [];

  // The response structure varies; try to extract meaningful data
  if (raw && typeof raw === "object") {
    // Walk the response to find balance entries
    const entries = flattenBalances(raw, address);
    results.push(...entries);
  }

  return results;
}

/**
 * Format balances as a human-readable string.
 */
export function formatBalancesForDisplay(balances: FormattedBalance[]): string {
  if (balances.length === 0) return "No balances found.";

  const lines = balances
    .filter((b) => b.balance !== "0" && b.balance !== "0.0")
    .map(
      (b) =>
        `  ${b.chain} (${b.chainId}): ${b.balance} ${b.symbol}`
    );

  if (lines.length === 0) return "All balances are zero.";
  return "Wallet Balances:\n" + lines.join("\n");
}

/**
 * Get a summary of supported chains.
 */
export async function listChains(): Promise<
  { chainId: number; name: string; isTest: boolean }[]
> {
  const chains = await getChains();
  return chains.map((c) => ({
    chainId: c.chainId,
    name: c.chainName || KNOWN_CHAINS[c.chainId] || `Chain ${c.chainId}`,
    isTest: c.isTest,
  }));
}

// Helper: attempt to extract balance info from the raw response
function flattenBalances(
  data: unknown,
  address: string
): FormattedBalance[] {
  const results: FormattedBalance[] = [];

  try {
    // Common response shapes - adapt as needed based on actual API response
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;

      // If keyed by address
      const addrData = obj[address.toLowerCase()] || obj[address] || obj;

      if (typeof addrData === "object" && addrData !== null) {
        for (const [key, val] of Object.entries(
          addrData as Record<string, unknown>
        )) {
          if (typeof val === "object" && val !== null) {
            const v = val as Record<string, unknown>;
            const chainId = Number(v.chainId || key);
            const balance = String(v.balance ?? v.amount ?? "0");
            const symbol = String(v.symbol ?? v.tokenSymbol ?? "ETH");

            results.push({
              chain: KNOWN_CHAINS[chainId] || `Chain ${chainId}`,
              chainId,
              symbol,
              balance: formatWei(balance),
              rawBalance: balance,
            });
          }
        }
      }
    }
  } catch {
    // Return empty if parsing fails
  }

  return results;
}

/**
 * Format a wei value to ETH (rough conversion for display).
 */
function formatWei(wei: string): string {
  try {
    const n = BigInt(wei);
    const eth = Number(n) / 1e18;
    if (eth === 0) return "0";
    if (eth < 0.000001) return "<0.000001";
    return eth.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  } catch {
    return wei;
  }
}

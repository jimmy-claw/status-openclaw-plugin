/**
 * !balance command handler
 * Queries Sepolia ETH balance via direct RPC (status-go wallet cache is unreliable)
 */

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const WALLET_ADDRESS = "0xB554044cF92D94485DaA6f558451E892A39ee829";

export interface BalanceResult {
  address: string;
  chain: string;
  chainId: number;
  balanceETH: string;
  balanceWei: string;
}

/**
 * Fetch ETH balance from Sepolia via direct JSON-RPC.
 */
export async function getSepoliaBalance(
  address: string = WALLET_ADDRESS
): Promise<BalanceResult> {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getBalance",
    params: [address, "latest"],
  };

  const res = await fetch(SEPOLIA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`RPC error: ${res.status}`);
  }

  const data = (await res.json()) as { result?: string; error?: { message: string } };

  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`);
  }

  const weiHex = data.result || "0x0";
  const wei = BigInt(weiHex);
  const eth = Number(wei) / 1e18;

  return {
    address,
    chain: "Sepolia",
    chainId: 11155111,
    balanceETH: eth.toFixed(6),
    balanceWei: wei.toString(),
  };
}

/**
 * Format balance for chat display.
 */
export function formatBalance(result: BalanceResult): string {
  return `💰 Wallet Balance\n\nAddress: ${result.address}\nChain: ${result.chain} (testnet)\nBalance: ${result.balanceETH} ETH`;
}

/**
 * Handle the !balance command — fetch and return formatted string.
 */
export async function handleBalanceCommand(args?: string): Promise<string> {
  try {
    const address = args?.trim() || WALLET_ADDRESS;
    const result = await getSepoliaBalance(address);
    return formatBalance(result);
  } catch (err) {
    return `❌ Failed to fetch balance: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * !tip command handler
 * Usage: !tip <address|ENS> <amount>
 * Sends Sepolia ETH from Jimmy's wallet to the recipient.
 */

const STATUS_RPC_URL = "http://127.0.0.1:21405/statusgo/CallRPC";
const WALLET_ADDRESS = "0xB554044cF92D94485DaA6f558451E892A39ee829";
const WALLET_PASSWORD = "jimmy-claw-2026";
const SEPOLIA_CHAIN_ID = 11155111;

interface RpcResult<T = unknown> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function callRPC<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(STATUS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const text = await res.text();
  let data: RpcResult<T>;
  const parsed = JSON.parse(text);
  data = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  return data.result as T;
}

function ethToWeiHex(eth: string): string {
  const wei = BigInt(Math.round(parseFloat(eth) * 1e18));
  return "0x" + wei.toString(16);
}

export async function handleTipCommand(args: string): Promise<string> {
  // Parse: !tip <address> <amount>
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    return "Usage: !tip <address|ENS> <amount>\nExample: !tip 0x1234...abcd 0.001";
  }

  const [recipient, amountStr] = parts;
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    return `Invalid amount: ${amountStr}`;
  }

  if (amount > 0.01) {
    return `⚠️ Amount ${amountStr} ETH exceeds the tip limit (0.01 ETH). For larger amounts, governance approval is needed (coming soon!)`;
  }

  // Resolve ENS if needed
  let toAddress = recipient;
  if (recipient.endsWith(".eth")) {
    try {
      toAddress = await callRPC<string>("ens_addressOf", [1, recipient]);
      if (!toAddress || toAddress === "0x0000000000000000000000000000000000000000") {
        return `❌ Could not resolve ENS name: ${recipient}`;
      }
    } catch (err) {
      return `❌ ENS resolution failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  try {
    // Build transaction
    const txArgs = {
      from: WALLET_ADDRESS,
      to: toAddress,
      value: ethToWeiHex(amountStr),
    };

    const buildResult = await callRPC<{ messageToSign: string; txArgs: Record<string, unknown> }>(
      "wallet_buildTransaction",
      [SEPOLIA_CHAIN_ID, JSON.stringify(txArgs)]
    );

    // Sign
    let signature = await callRPC<string>("wallet_signMessage", [
      buildResult.messageToSign,
      WALLET_ADDRESS,
      WALLET_PASSWORD,
    ]);
    if (signature.startsWith("0x")) signature = signature.slice(2);

    // Send
    const txHash = await callRPC<string>("wallet_sendTransactionWithSignature", [
      SEPOLIA_CHAIN_ID,
      "transfer",
      JSON.stringify(buildResult.txArgs),
      signature,
    ]);

    return `✅ Tip sent!\n\nTo: ${recipient}${recipient !== toAddress ? ` (${toAddress})` : ""}\nAmount: ${amountStr} ETH\nChain: Sepolia\nTx: https://sepolia.etherscan.io/tx/${txHash}`;
  } catch (err) {
    return `❌ Transaction failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// Build → Sign → Send transaction flow

import { callRPC, resolveAddress } from "./rpc.js";
import { BuildTransactionResult, SendTxArgs } from "./types.js";

const DEFAULT_PASSWORD =
  process.env.STATUS_WALLET_PASSWORD || "jimmy-claw-2026";

export interface SendTransactionOptions {
  from: string;
  to: string; // address or ENS name
  value: string; // value in wei (hex, e.g. "0xDE0B6B3A7640000" for 1 ETH)
  chainId: number;
  data?: string;
  gas?: string;
  password?: string;
}

export interface TransactionResult {
  txHash: string;
  chainId: number;
  from: string;
  to: string;
}

/**
 * Convert ETH amount (as string, e.g. "0.01") to wei hex string.
 */
export function ethToWeiHex(ethAmount: string): string {
  const wei = BigInt(Math.round(parseFloat(ethAmount) * 1e18));
  return "0x" + wei.toString(16);
}

/**
 * Build a transaction via wallet_buildTransaction.
 * Note: sendTxArgs must be passed as a JSON STRING to the RPC.
 */
export async function buildTransaction(
  chainId: number,
  txArgs: SendTxArgs
): Promise<BuildTransactionResult> {
  const sendTxArgsJson = JSON.stringify(txArgs);
  return callRPC<BuildTransactionResult>("wallet_buildTransaction", [
    chainId,
    sendTxArgsJson,
  ]);
}

/**
 * Sign a message hash with the wallet.
 * Returns the signature WITHOUT the 0x prefix.
 */
export async function signMessage(
  hash: string,
  address: string,
  password?: string
): Promise<string> {
  const sig = await callRPC<string>("wallet_signMessage", [
    hash,
    address,
    password || DEFAULT_PASSWORD,
  ]);

  // Strip 0x prefix if present
  return sig.startsWith("0x") ? sig.slice(2) : sig;
}

/**
 * Send a signed transaction.
 */
export async function sendSignedTransaction(
  chainId: number,
  sendTxArgsJson: string,
  signature: string
): Promise<string> {
  return callRPC<string>("wallet_sendTransactionWithSignature", [
    chainId,
    "transfer",
    sendTxArgsJson,
    signature,
  ]);
}

/**
 * Full send flow: resolve address → build → sign → send.
 */
export async function sendTransaction(
  options: SendTransactionOptions
): Promise<TransactionResult> {
  const { from, chainId, value, data, gas, password } = options;

  // 1. Resolve recipient (ENS or address)
  const to = await resolveAddress(options.to);

  // 2. Build transaction args
  const txArgs: SendTxArgs = {
    from,
    to,
    value,
    ...(data && { data }),
    ...(gas && { gas }),
  };

  // 3. Build transaction (get message to sign)
  const buildResult = await buildTransaction(chainId, txArgs);

  // 4. Sign the message
  const signature = await signMessage(
    buildResult.messageToSign,
    from,
    password
  );

  // 5. Send with signature
  const sendTxArgsJson = JSON.stringify(buildResult.txArgs);
  const txHash = await sendSignedTransaction(chainId, sendTxArgsJson, signature);

  return { txHash, chainId, from, to };
}

/**
 * Convenience: send ETH by amount (in ETH, not wei).
 */
export async function sendETH(
  from: string,
  to: string,
  amountETH: string,
  chainId = 1,
  password?: string
): Promise<TransactionResult> {
  return sendTransaction({
    from,
    to,
    value: ethToWeiHex(amountETH),
    chainId,
    password,
  });
}

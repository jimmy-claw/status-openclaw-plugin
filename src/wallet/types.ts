// Types for Status wallet RPC API responses

export interface RpcResponse<T = unknown> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export interface ChainInfo {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  blockExplorerUrl: string;
  iconUrl: string;
  nativeCurrencyName: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals: number;
  isTest: boolean;
  layer: number;
  enabled: boolean;
}

export interface Token {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  chainId: number;
  communityId?: string;
}

export interface AccountInfo {
  address: string;
  wallet: boolean;
  chat: boolean;
  type: string;
  name: string;
  emoji: string;
  colorId: string;
  path: string;
  derivedFrom: string;
}

export interface BalanceInfo {
  address: string;
  chainId: number;
  tokenSymbol: string;
  balance: string;
  balanceFormatted: string;
}

export interface BuildTransactionResult {
  messageToSign: string;
  txArgs: SendTxArgs;
}

export interface SendTxArgs {
  from: string;
  to: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
}

export interface RpcProvider {
  chainId: number;
  url: string;
  active: boolean;
}

export const KNOWN_CHAINS: Record<number, string> = {
  1: "Ethereum Mainnet",
  10: "Optimism",
  42161: "Arbitrum One",
  137: "Polygon",
  56: "BNB Smart Chain",
  8453: "Base",
  59144: "Linea",
};

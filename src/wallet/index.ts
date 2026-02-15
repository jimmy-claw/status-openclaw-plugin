// Wallet module - main entry point

export {
  callRPC,
  startWallet,
  getChains,
  getAccounts,
  resolveENS,
  resolveAddress,
  setChainRpcProviders,
} from "./rpc.js";

export {
  getBalances,
  getFormattedBalances,
  formatBalancesForDisplay,
  listChains,
} from "./balances.js";
export type { FormattedBalance } from "./balances.js";

export {
  sendTransaction,
  sendETH,
  buildTransaction,
  signMessage,
  sendSignedTransaction,
  ethToWeiHex,
} from "./send.js";
export type { SendTransactionOptions, TransactionResult } from "./send.js";

export {
  getAllTokens,
  findTokenBySymbol,
  findTokenByName,
  findTokenByAddress,
  getPopularTokens,
  clearTokenCache,
} from "./tokens.js";

export { KNOWN_CHAINS } from "./types.js";
export type {
  RpcResponse,
  ChainInfo,
  Token,
  AccountInfo,
  BalanceInfo,
  BuildTransactionResult,
  SendTxArgs,
  RpcProvider,
} from "./types.js";

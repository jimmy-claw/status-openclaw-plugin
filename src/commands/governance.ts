/**
 * Governance module — multi-sig-lite for the wallet bot.
 * 
 * Commands:
 *   !signers                    — List current signers
 *   !addsigner <@pubkey>        — Add a signer (admin only)
 *   !removesigner <@pubkey>     — Remove a signer (admin only)  
 *   !tip <@pubkey> <amount>     — If amount > 0.01, requires signer approval
 *   !approve <proposal_id>      — Approve a pending proposal
 *   !reject <proposal_id>       — Reject a pending proposal
 *   !proposals                  — List pending proposals
 *   !threshold [amount]         — View or set the governance threshold
 *
 * Rules:
 *   - Tips ≤ threshold: go through instantly
 *   - Tips > threshold: create a proposal, need majority of signers to approve
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

const GOV_PATH = process.env.GOVERNANCE_PATH ||
  "/home/vpavlin/.openclaw/workspace/status-openclaw-plugin/governance.json";

// Admin pubkey (Václav) — can add/remove signers
const ADMIN_PUBKEY = "0x040d7ae79c51ec0513f81dfee7fbde365c53e6dea359ab107594cb8ef4a6f9794c5c8a1a7fc348a8cd6ac16332922555ddf98be147ba293dc74343f4070595b6a8";

export interface Proposal {
  id: string;
  type: "tip";
  from: string;        // who requested
  to: string;          // recipient address
  toName?: string;     // display name
  amount: string;      // ETH amount
  approvals: string[]; // pubkeys that approved
  rejections: string[];
  status: "pending" | "approved" | "rejected" | "executed";
  createdAt: string;
}

export interface GovernanceState {
  signers: string[];         // pubkeys of signers
  threshold: number;         // ETH amount above which governance is needed (default 0.01)
  requiredApprovals: number; // how many signers need to approve (default: majority)
  proposals: Proposal[];
  messageToProposal?: Record<string, string>; // Status message ID → proposal ID
}

function loadState(): GovernanceState {
  if (!existsSync(GOV_PATH)) {
    return {
      signers: [ADMIN_PUBKEY],
      threshold: 0.01,
      requiredApprovals: 1,
      proposals: [],
    };
  }
  try {
    return JSON.parse(readFileSync(GOV_PATH, "utf-8"));
  } catch {
    return { signers: [ADMIN_PUBKEY], threshold: 0.01, requiredApprovals: 1, proposals: [] };
  }
}

function saveState(state: GovernanceState): void {
  writeFileSync(GOV_PATH, JSON.stringify(state, null, 2));
}

function shortKey(pubkey: string): string {
  return pubkey.slice(0, 10) + "..." + pubkey.slice(-6);
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function isSigner(pubkey: string): boolean {
  const state = loadState();
  return state.signers.includes(pubkey);
}

export function handleSignersCommand(): string {
  const state = loadState();
  if (state.signers.length === 0) return "No signers configured.";
  const lines = state.signers.map((s, i) => `  ${i + 1}. ${shortKey(s)}`);
  return `🔐 Signers (${state.signers.length}):\n${lines.join("\n")}\n\nThreshold: ${state.threshold} ETH\nRequired approvals: ${state.requiredApprovals}`;
}

export function handleAddSignerCommand(args: string, senderPubkey: string): string {
  if (senderPubkey !== ADMIN_PUBKEY) return "❌ Only the admin can add signers.";
  const pubkey = args.trim().replace(/^@/, "");
  if (!pubkey.startsWith("0x04") || pubkey.length < 130) return "❌ Invalid pubkey.";

  const state = loadState();
  if (state.signers.includes(pubkey)) return "Already a signer.";
  state.signers.push(pubkey);
  // Auto-adjust required approvals to majority
  state.requiredApprovals = Math.ceil(state.signers.length / 2);
  saveState(state);
  return `✅ Added signer ${shortKey(pubkey)}\nSigners: ${state.signers.length} | Required approvals: ${state.requiredApprovals}`;
}

export function handleRemoveSignerCommand(args: string, senderPubkey: string): string {
  if (senderPubkey !== ADMIN_PUBKEY) return "❌ Only the admin can remove signers.";
  const pubkey = args.trim().replace(/^@/, "");
  const state = loadState();
  const idx = state.signers.indexOf(pubkey);
  if (idx === -1) return "Not a signer.";
  state.signers.splice(idx, 1);
  state.requiredApprovals = Math.max(1, Math.ceil(state.signers.length / 2));
  saveState(state);
  return `✅ Removed signer ${shortKey(pubkey)}\nSigners: ${state.signers.length} | Required approvals: ${state.requiredApprovals}`;
}

export function handleThresholdCommand(args: string, senderPubkey: string): string {
  const state = loadState();
  if (!args.trim()) {
    return `Current threshold: ${state.threshold} ETH\nTips above this require ${state.requiredApprovals} signer approval(s).`;
  }
  if (senderPubkey !== ADMIN_PUBKEY) return "❌ Only the admin can change the threshold.";
  const val = parseFloat(args.trim());
  if (isNaN(val) || val <= 0) return "❌ Invalid threshold amount.";
  state.threshold = val;
  saveState(state);
  return `✅ Threshold updated to ${val} ETH`;
}

/**
 * Check if a tip needs governance approval. Returns null if it can proceed,
 * or a Proposal if it was created and needs approvals.
 */
export function checkGovernance(
  senderPubkey: string,
  toAddress: string,
  toName: string | undefined,
  amount: string
): Proposal | null {
  const state = loadState();
  const amountNum = parseFloat(amount);
  if (amountNum <= state.threshold) return null; // Under threshold, proceed

  // Create proposal
  const proposal: Proposal = {
    id: generateId(),
    type: "tip",
    from: senderPubkey,
    to: toAddress,
    toName,
    amount,
    approvals: [],
    rejections: [],
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  state.proposals.push(proposal);
  saveState(state);
  return proposal;
}

/**
 * Link a Status message ID to a proposal (call after sending proposal message).
 */
export function linkMessageToProposal(messageId: string, proposalId: string): void {
  const state = loadState();
  if (!state.messageToProposal) state.messageToProposal = {};
  state.messageToProposal[messageId] = proposalId;
  saveState(state);
}

/**
 * Resolve a proposal ID from either direct ID, message ID (reply), or latest pending.
 */
export function resolveProposalId(input: string, replyToMessageId?: string): string | null {
  const state = loadState();
  
  // 1. If replying to a proposal message
  if (replyToMessageId && state.messageToProposal?.[replyToMessageId]) {
    return state.messageToProposal[replyToMessageId];
  }
  
  // 2. Direct proposal ID
  if (input) {
    const p = state.proposals.find(p => p.id === input);
    if (p) return p.id;
  }
  
  // 3. No ID given — use the latest pending proposal
  const pending = state.proposals.filter(p => p.status === "pending");
  if (pending.length === 1) return pending[0].id;
  if (pending.length > 1) return null; // ambiguous
  
  return null;
}

export function handleApproveCommand(args: string, senderPubkey: string, replyToMessageId?: string): string {
  const proposalId = resolveProposalId(args.trim(), replyToMessageId);
  if (!proposalId) {
    const state = loadState();
    const pending = state.proposals.filter(p => p.status === "pending");
    if (pending.length > 1) return `Multiple pending proposals. Please specify:\n${pending.map(p => `  ${p.id}: ${p.amount} ETH → ${p.toName || shortKey(p.to)}`).join("\n")}`;
    return "No pending proposals found.";
  }

  const state = loadState();
  if (!state.signers.includes(senderPubkey)) return "❌ You are not a signer.";

  const proposal = state.proposals.find(p => p.id === proposalId);
  if (!proposal) return `❌ Proposal ${proposalId} not found.`;
  if (proposal.status !== "pending") return `Proposal ${proposalId} is already ${proposal.status}.`;
  if (proposal.approvals.includes(senderPubkey)) return "You already approved this proposal.";

  proposal.approvals.push(senderPubkey);

  if (proposal.approvals.length >= state.requiredApprovals) {
    proposal.status = "approved";
    saveState(state);
    return `✅ Proposal ${proposalId} APPROVED! (${proposal.approvals.length}/${state.requiredApprovals})\n\nReady to execute: !tip ${proposal.to} ${proposal.amount}\nAmount: ${proposal.amount} ETH → ${proposal.toName || proposal.to}`;
  }

  saveState(state);
  return `👍 Approved! (${proposal.approvals.length}/${state.requiredApprovals} needed)\nProposal ${proposalId}: ${proposal.amount} ETH → ${proposal.toName || shortKey(proposal.to)}`;
}

export function handleRejectCommand(args: string, senderPubkey: string, replyToMessageId?: string): string {
  const proposalId = resolveProposalId(args.trim(), replyToMessageId);
  if (!proposalId) {
    const state = loadState();
    const pending = state.proposals.filter(p => p.status === "pending");
    if (pending.length > 1) return `Multiple pending proposals. Please specify:\n${pending.map(p => `  ${p.id}: ${p.amount} ETH → ${p.toName || shortKey(p.to)}`).join("\n")}`;
    return "No pending proposals found.";
  }

  const state = loadState();
  if (!state.signers.includes(senderPubkey)) return "❌ You are not a signer.";

  const proposal = state.proposals.find(p => p.id === proposalId);
  if (!proposal) return `❌ Proposal ${proposalId} not found.`;
  if (proposal.status !== "pending") return `Proposal ${proposalId} is already ${proposal.status}.`;

  proposal.rejections.push(senderPubkey);
  const remaining = state.signers.length - proposal.rejections.length;
  if (remaining < state.requiredApprovals) {
    proposal.status = "rejected";
    saveState(state);
    return `❌ Proposal ${proposalId} REJECTED. Not enough remaining signers to reach approval.`;
  }

  saveState(state);
  return `👎 Rejected by ${shortKey(senderPubkey)}. (${proposal.rejections.length} rejections, ${proposal.approvals.length}/${state.requiredApprovals} approvals)`;
}

export function handleProposalsCommand(): string {
  const state = loadState();
  const pending = state.proposals.filter(p => p.status === "pending");
  if (pending.length === 0) return "No pending proposals.";

  const lines = pending.map(p =>
    `  📋 ${p.id}: ${p.amount} ETH → ${p.toName || shortKey(p.to)} [${p.approvals.length}/${state.requiredApprovals} approvals]`
  );
  return `Pending Proposals:\n${lines.join("\n")}\n\nUse !approve <id> or !reject <id>`;
}

/**
 * Get an approved proposal by ID and mark it executed.
 */
export function executeProposal(proposalId: string): Proposal | null {
  const state = loadState();
  const proposal = state.proposals.find(p => p.id === proposalId && p.status === "approved");
  if (!proposal) return null;
  proposal.status = "executed";
  saveState(state);
  return proposal;
}

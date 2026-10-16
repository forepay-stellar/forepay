/** stellar.expert pages the repayment screens open in a new tab ("Receipt", "View contract"). */
const EXPLORER = "https://stellar.expert/explorer/testnet";

const CONTRACT_ID = process.env.NEXT_PUBLIC_ADVANCE_CONTRACT_ID ?? "";

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

export function explorerContractUrl(): string {
  return `${EXPLORER}/contract/${CONTRACT_ID}`;
}

// Public URLs, set per deploy. "Open the app" points at the deployed fe from #22; until that
// exists it falls back to the fe README so the button never leads nowhere.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://github.com/forepay-stellar/forepay/tree/main/fe";

// The advance contract on stellar.expert, from docs/deployments.md.
export const CONTRACT_URL =
  process.env.NEXT_PUBLIC_CONTRACT_URL ||
  "https://github.com/forepay-stellar/forepay/blob/main/docs/deployments.md";

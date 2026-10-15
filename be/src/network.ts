/**
 * The addresses Forepay runs against on testnet, as recorded in docs/deployments.md.
 *
 * This object and the JSON block in docs/deployments.md must be identical; a test
 * (network.test.ts) fails the build the moment they drift. Code reads addresses from
 * here, people read them from the doc, and neither can be updated alone.
 *
 * Only testnet: the Instawards scope excludes mainnet funds.
 */
export const RECORDED = {
  network: "testnet",
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  contracts: {
    /** Reclaim's own verifier; its epoch holds the production attestor (#2). */
    reclaimVerifier: "CA3EMXR6JOOTNP44T3OAJFMMMGKRRETDJKBLZP2RU3SIY4SDFAH54DU5",
    /** Circle's testnet USDC as a Stellar Asset Contract, 7 decimals. */
    usdcSac: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    /** The Forepay advance contract. Null until #15 deploys it. */
    advance: null as string | null,
  },
} as const;

export type ContractName = keyof typeof RECORDED.contracts;

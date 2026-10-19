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
  /** History (operations, failed transactions, balance changes) that the RPC does not keep. */
  horizonUrl: "https://horizon-testnet.stellar.org",
  contracts: {
    /** Reclaim's own verifier; its epoch holds the production attestor (#2). */
    reclaimVerifier: "CA3EMXR6JOOTNP44T3OAJFMMMGKRRETDJKBLZP2RU3SIY4SDFAH54DU5",
    /** Circle's testnet USDC as a Stellar Asset Contract, 7 decimals. */
    usdcSac: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    /** The Forepay advance contract, deployed from the release by #15. */
    advance: "CCQFL2Q66DHFAZU2KPRWNHU4FTZJW75N5XLNXECFFGMW3PROIXJPI2HS" as string | null,
  },
} as const;

/**
 * The classic asset behind `usdcSac`: Circle's testnet USDC. Horizon reports balance changes
 * and trustlines by asset code and issuer, not by contract. network.test.ts checks that this
 * asset's SAC address is exactly `usdcSac`.
 */
export const USDC_ASSET = {
  code: "USDC",
  issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
} as const;

export type ContractName = keyof typeof RECORDED.contracts;

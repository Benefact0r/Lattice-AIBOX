use anchor_lang::prelude::*;

/// On-chain record for a registered GPU provider.
#[account]
pub struct ProviderRecord {
    /// The provider's wallet / authority (can deregister, receive payment).
    pub authority: Pubkey,
    /// QVAC P2P public key (hex string, 64 chars → stored as 32 bytes).
    pub qvac_pubkey: [u8; 32],
    /// Models this provider supports (up to 8, each a 32-byte hash/id).
    pub models: Vec<[u8; 32]>,
    /// Price in USDC micro-units per 1 000 tokens.
    pub price_per_1k: u64,
    /// Amount of USDC staked (lamports of token, 6 decimals).
    pub stake_amount: u64,
    /// Whether the provider is currently active.
    pub active: bool,
    /// Bump for PDA derivation.
    pub bump: u8,
}

impl ProviderRecord {
    /// Max models per provider.
    pub const MAX_MODELS: usize = 8;

    pub fn space() -> usize {
        8                           // discriminator
        + 32                        // authority
        + 32                        // qvac_pubkey
        + 4 + (32 * Self::MAX_MODELS) // models vec
        + 8                         // price_per_1k
        + 8                         // stake_amount
        + 1                         // active
        + 1                         // bump
    }
}

/// Escrow account locking USDC for one inference job.
#[account]
pub struct JobEscrow {
    /// Consumer who locked the funds.
    pub consumer: Pubkey,
    /// Provider this job is assigned to.
    pub provider: Pubkey,
    /// Locked USDC amount (token lamports).
    pub amount: u64,
    /// SHA-256 hash of the expected result, set by provider at settle time.
    pub result_hash: Option<[u8; 32]>,
    /// Job state.
    pub state: JobState,
    /// Bump for PDA derivation.
    pub bump: u8,
}

impl JobEscrow {
    pub fn space() -> usize {
        8           // discriminator
        + 32        // consumer
        + 32        // provider
        + 8         // amount
        + 1 + 32    // Option<[u8;32]>
        + 1         // state enum
        + 1         // bump
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum JobState {
    /// Funds locked, waiting for provider.
    Locked,
    /// Provider submitted result hash, funds released.
    Settled,
    /// Provider slashed, funds returned to consumer.
    Slashed,
}

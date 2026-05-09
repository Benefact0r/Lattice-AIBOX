use anchor_lang::prelude::*;

#[error_code]
pub enum LatticeError {
    #[msg("Provider is not active")]
    ProviderInactive,
    #[msg("Too many models — max 8")]
    TooManyModels,
    #[msg("Stake amount must be greater than zero")]
    ZeroStake,
    #[msg("Job is not in Locked state")]
    JobNotLocked,
    #[msg("Only the assigned provider can settle this job")]
    UnauthorizedProvider,
    #[msg("Only the consumer or assigned provider can settle this job")]
    UnauthorizedSettler,
    #[msg("Only the consumer can slash this job")]
    UnauthorizedConsumer,
    #[msg("Insufficient stake to cover slash")]
    InsufficientStake,
}

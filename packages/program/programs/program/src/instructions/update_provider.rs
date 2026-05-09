use anchor_lang::prelude::*;

use crate::{error::LatticeError, state::ProviderRecord};

#[derive(Accounts)]
pub struct UpdateProvider<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"provider", authority.key().as_ref()],
        bump = provider_record.bump,
        has_one = authority,
    )]
    pub provider_record: Account<'info, ProviderRecord>,
}

/// Update mutable provider fields in place. The stake vault is untouched.
/// Use to rotate QVAC pubkey (e.g. provider restart on new machine), change
/// price, or update model list.
pub fn handler(
    ctx: Context<UpdateProvider>,
    qvac_pubkey: [u8; 32],
    models: Vec<[u8; 32]>,
    price_per_1k: u64,
) -> Result<()> {
    require!(models.len() <= ProviderRecord::MAX_MODELS, LatticeError::TooManyModels);

    let record = &mut ctx.accounts.provider_record;
    record.qvac_pubkey = qvac_pubkey;
    record.models = models;
    record.price_per_1k = price_per_1k;

    msg!("Provider updated — qvac pubkey rotated, price={}", price_per_1k);
    Ok(())
}

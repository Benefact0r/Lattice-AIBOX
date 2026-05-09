use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{error::LatticeError, state::ProviderRecord};

#[derive(Accounts)]
pub struct RegisterProvider<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = ProviderRecord::space(),
        seeds = [b"provider", authority.key().as_ref()],
        bump
    )]
    pub provider_record: Account<'info, ProviderRecord>,

    #[account(
        mut,
        constraint = provider_token_account.owner == authority.key()
    )]
    pub provider_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"stake_vault", authority.key().as_ref()],
        bump
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterProvider>,
    qvac_pubkey: [u8; 32],
    models: Vec<[u8; 32]>,
    price_per_1k: u64,
    stake_amount: u64,
) -> Result<()> {
    require!(stake_amount > 0, LatticeError::ZeroStake);
    require!(models.len() <= ProviderRecord::MAX_MODELS, LatticeError::TooManyModels);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.provider_token_account.to_account_info(),
                to: ctx.accounts.stake_vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        stake_amount,
    )?;

    let record = &mut ctx.accounts.provider_record;
    record.authority = ctx.accounts.authority.key();
    record.qvac_pubkey = qvac_pubkey;
    record.models = models;
    record.price_per_1k = price_per_1k;
    record.stake_amount = stake_amount;
    record.active = true;
    record.bump = ctx.bumps.provider_record;

    msg!("Provider registered: {:?}", ctx.accounts.authority.key());
    Ok(())
}

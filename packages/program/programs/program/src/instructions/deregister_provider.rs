use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{error::LatticeError, state::ProviderRecord};

#[derive(Accounts)]
pub struct DeregisterProvider<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"provider", authority.key().as_ref()],
        bump = provider_record.bump,
        has_one = authority,
        close = authority
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

pub fn handler(ctx: Context<DeregisterProvider>) -> Result<()> {
    let authority_key = ctx.accounts.authority.key();
    let stake_amount = ctx.accounts.provider_record.stake_amount;

    require!(ctx.accounts.provider_record.active, LatticeError::ProviderInactive);

    let bump = ctx.bumps.stake_vault;
    let seeds: &[&[&[u8]]] = &[&[b"stake_vault", authority_key.as_ref(), &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.stake_vault.to_account_info(),
                to: ctx.accounts.provider_token_account.to_account_info(),
                authority: ctx.accounts.stake_vault.to_account_info(),
            },
            seeds,
        ),
        stake_amount,
    )?;

    msg!("Provider deregistered: {:?}", authority_key);
    Ok(())
}

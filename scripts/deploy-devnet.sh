#!/usr/bin/env bash
# Deploy Lattice to Solana devnet.
#
# Prerequisites:
#   - ~/.config/solana/id.json funded with ≥ 4 SOL on devnet
#     Get SOL: https://faucet.quicknode.com/solana/devnet
#              (enter DM84RhRphN3x64ehhmkc6v9D2St4QZXLTQoc7LoS3Kbj)
#   - anchor CLI installed (avm use latest)
#   - spl-token CLI installed (cargo install spl-token-cli)
#
# Usage:
#   ./scripts/deploy-devnet.sh            # deploy + create fresh USDC mint
#   ./scripts/deploy-devnet.sh --skip-mint <USDC_MINT>  # reuse existing mint

set -eo pipefail
cd "$(dirname "$0")/.."

PROGRAM_ID="4yR7v2c23wrxgFzcbtocvMvVxucYQHGfSWczNW3FxV7T"
DEVNET_RPC="https://api.devnet.solana.com"
KEYPAIR_PATH="${SOLANA_KEYPAIR_PATH:-$HOME/.config/solana/id.json}"

SKIP_MINT=false
EXISTING_MINT=""
if [[ "$1" == "--skip-mint" && -n "$2" ]]; then
  SKIP_MINT=true
  EXISTING_MINT="$2"
fi

# ── sanity checks ────────────────────────────────────────────────────────────
echo "=== Lattice Devnet Deployment ==="
echo "  Deployer : $(solana address --keypair "$KEYPAIR_PATH")"
BALANCE=$(solana balance --url devnet --keypair "$KEYPAIR_PATH" | awk '{print $1}')
echo "  Balance  : ${BALANCE} SOL"

if (( $(echo "$BALANCE < 3" | bc -l) )); then
  echo ""
  echo "ERROR: Need ≥ 3 SOL, have ${BALANCE} SOL."
  echo "Fund your wallet at: https://faucet.quicknode.com/solana/devnet"
  echo "  Wallet: $(solana address --keypair "$KEYPAIR_PATH")"
  exit 1
fi

# ── build ────────────────────────────────────────────────────────────────────
echo ""
echo "1. Building program..."
cd packages/program
anchor build 2>&1 | tail -5
cd ../..

# ── deploy ───────────────────────────────────────────────────────────────────
echo ""
echo "2. Deploying program to devnet (this takes ~60s)..."
DEPLOY_OUT=$(anchor deploy --provider.cluster devnet 2>&1)
echo "$DEPLOY_OUT" | tail -10

# Verify the program ID matches
if echo "$DEPLOY_OUT" | grep -q "$PROGRAM_ID"; then
  echo "   Program ID confirmed: $PROGRAM_ID"
elif echo "$DEPLOY_OUT" | grep -qi "already deployed\|already up to date"; then
  echo "   Program already deployed at $PROGRAM_ID"
else
  echo "   WARNING: Could not confirm program ID in output. Check above."
fi

# ── USDC mint ────────────────────────────────────────────────────────────────
if [[ "$SKIP_MINT" == "true" ]]; then
  USDC_MINT="$EXISTING_MINT"
  echo ""
  echo "3. Reusing existing USDC mint: $USDC_MINT"
else
  echo ""
  echo "3. Creating devnet USDC test mint (6 decimals)..."
  USDC_MINT=$(spl-token create-token \
    --url devnet \
    --decimals 6 \
    --keypair "$KEYPAIR_PATH" \
    2>&1 | grep "Creating token" | awk '{print $3}')

  if [[ -z "$USDC_MINT" ]]; then
    echo "   ERROR: Failed to create USDC mint. Output above."
    exit 1
  fi
  echo "   USDC mint: $USDC_MINT"

  echo ""
  echo "4. Creating ATA and minting 100,000 test USDC..."
  spl-token create-account "$USDC_MINT" --url devnet --keypair "$KEYPAIR_PATH" 2>&1 | tail -3
  spl-token mint "$USDC_MINT" 100000 --url devnet --keypair "$KEYPAIR_PATH" 2>&1 | tail -3
  echo "   Minted 100,000 USDC to $(solana address --keypair "$KEYPAIR_PATH")"
fi

# ── write env files ──────────────────────────────────────────────────────────
echo ""
echo "5. Writing .env.local files..."

PROVIDER_ENV_FILE="packages/provider/.env.local"
SDK_ENV_FILE="packages/sdk/.env.local"

write_env() {
  local FILE="$1"
  cat > "$FILE" <<EOF
# Lattice — devnet configuration (written by deploy-devnet.sh)
SOLANA_RPC_URL=${DEVNET_RPC}
SOLANA_KEYPAIR_PATH=${KEYPAIR_PATH}
USDC_MINT=${USDC_MINT}
STAKE_AMOUNT=100000000
PRICE_PER_1K=1000
LATTICE_PROGRAM_ID=${PROGRAM_ID}
EOF
  echo "   Wrote $FILE"
}

write_env "$PROVIDER_ENV_FILE"
write_env "$SDK_ENV_FILE"

# ── summary ──────────────────────────────────────────────────────────────────
echo ""
echo "==================================================="
echo "  DEVNET DEPLOYMENT COMPLETE"
echo "==================================================="
echo "  Program ID : $PROGRAM_ID"
echo "  USDC Mint  : $USDC_MINT"
echo "  RPC        : $DEVNET_RPC"
echo "  Deployer   : $(solana address --keypair "$KEYPAIR_PATH")"
echo ""
echo "Next steps:"
echo "  1. Start the provider:  node packages/provider/src/index.js"
echo "  2. Run the e2e test:    node packages/sdk/test-infer-and-settle.js"
echo "==================================================="

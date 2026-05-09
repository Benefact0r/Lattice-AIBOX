#!/usr/bin/env bash
# Bring up the local dev environment without resetting on-chain state.
# Useful when resuming work — preserves the deployed program, USDC mint,
# provider registration, and any locked job escrows from prior sessions.
#
# Usage: ./scripts/dev-up.sh
#
# To start fresh instead, run:
#   solana-test-validator --reset --quiet

set -e
cd "$(dirname "$0")/.."

if pgrep -f "solana-test-validator" > /dev/null; then
  echo "Validator already running."
else
  echo "Starting solana-test-validator (resume mode)..."
  solana-test-validator --quiet > /tmp/lattice-validator.log 2>&1 &
  echo "  PID: $!  log: /tmp/lattice-validator.log"
  # wait for it to come up
  until solana cluster-version --url localhost > /dev/null 2>&1; do
    sleep 1
  done
  echo "  Validator ready."
fi

if pgrep -f "node packages/provider/src/index.js" > /dev/null; then
  echo "Provider already running."
else
  echo "Starting provider node (deterministic seed)..."
  cd "$(dirname "$0")/.."
  node packages/provider/src/index.js \
    1111111111111111111111111111111111111111111111111111111111111111 \
    > /tmp/lattice-provider.log 2>&1 &
  echo "  PID: $!  log: /tmp/lattice-provider.log"
  until grep -q "PROVIDER ONLINE" /tmp/lattice-provider.log 2>/dev/null; do
    sleep 1
  done
  echo "  Provider online."
fi

echo
echo "Tail logs:"
echo "  tail -f /tmp/lattice-validator.log"
echo "  tail -f /tmp/lattice-provider.log"

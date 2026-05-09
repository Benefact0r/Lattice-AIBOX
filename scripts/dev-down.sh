#!/usr/bin/env bash
# Stop the local dev environment cleanly. Preserves on-chain state in test-ledger/
# so dev-up.sh can resume.

pkill -f "solana-test-validator" && echo "Stopped validator" || echo "(no validator)"
pkill -f "node packages/provider/src/index.js" && echo "Stopped provider" || echo "(no provider)"
pkill -f "qvac-worker" && echo "Stopped QVAC workers" || echo "(no QVAC workers)"
rm -f ~/.qvac/.worker.lock
echo "Done."

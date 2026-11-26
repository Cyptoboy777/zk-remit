#!/usr/bin/env bash
set -euo pipefail

./scripts/install-compactc.sh 0.31.1
export PATH="$HOME/.local/compactc-0.31.1:$PATH"
compactc contract/src/zk-remit.compact contract/src/managed/zk-remit
npm run build

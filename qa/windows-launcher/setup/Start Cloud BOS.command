#!/bin/sh
set -eu
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Cloud BOS needs Node.js 20 or later. Install the current supported Node.js from https://nodejs.org/en/download, then open this launcher again.'
  printf '%s\n' 'Press Return to close.'
  read -r ignored
  exit 1
fi
setup_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
node "$setup_dir/setup.mjs" "$@" || { printf '%s\n' 'Press Return to close.'; read -r ignored; exit 1; }
printf '%s\n' 'Press Return to close.'
read -r ignored

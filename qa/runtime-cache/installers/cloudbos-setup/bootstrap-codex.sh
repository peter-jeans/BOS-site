#!/bin/sh
# Installed plugin bootstrap. This is a child-process PATH, never a global edit.
set -eu
bos_event=${1:-}
case "$bos_event" in
  SessionStart|UserPromptSubmit|PreToolUse|PostToolUse|Stop|SessionEnd) ;;
  *) printf '%s\n' 'BOS hook bootstrap: unsupported event.' >&2; exit 1 ;;
esac
# A conservative route refusal only; marker presence grants no authority.
# Preserve private/local projects even when the public runtime is unavailable.
bos_guard_dir=$(pwd -P)
while :; do
  if [ -e "$bos_guard_dir/.bos" ] || [ -e "$bos_guard_dir/BOS_PRODUCT_AUTHORITY.json" ]; then
    printf '%s\n' '{}'; exit 0
  fi
  bos_parent=$(dirname -- "$bos_guard_dir")
  [ "$bos_parent" != "$bos_guard_dir" ] || break
  bos_guard_dir=$bos_parent
done
bos_repair() {
  case "$bos_event" in
    PreToolUse) printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"BOS runtime needs repair. Open BOS setup before making this Cloud call."}}' ;;
    SessionStart) printf '%s\n' '{"systemMessage":"BOS runtime needs repair. Open BOS setup. Ordinary authorized work can continue."}' ;;
    *) printf '%s\n' '{}' ;;
  esac
  exit 0
}
if [ -n "${BOS_RUNTIME_CACHE_ROOT:-}" ]; then bos_cache=$BOS_RUNTIME_CACHE_ROOT
elif [ -n "${HOME:-}" ]; then bos_cache="$HOME/.cloudbos-setup/runtimes"
else bos_repair
fi
bos_node="$bos_cache/node-v24.22.1-darwin-arm64-6f32069480ec14d5/bin/node"
[ -f "$bos_node" ] && [ ! -L "$bos_node" ] && [ -x "$bos_node" ] || bos_repair
bos_digest=$(/usr/bin/env -u PERL5OPT -u PERL5LIB /usr/bin/shasum -a 256 -- "$bos_node" 2>/dev/null) || bos_repair
bos_digest=${bos_digest%% *}
[ "$bos_digest" = '6f32069480ec14d52b6d7b1f3c7124cfbbc46203abf5ddf5c65b127435f3f329' ] || bos_repair
bos_plugin=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
unset NODE_OPTIONS NODE_PATH
PATH="$(dirname -- "$bos_node"):${PATH:-/usr/bin:/bin}"
export PATH
exec "$bos_node" "$bos_plugin/scripts/bos_hook_ownership.mjs" run --host codex

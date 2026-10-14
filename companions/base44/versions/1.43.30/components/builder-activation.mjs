// App-facing resources and one-session prompts. No connection, preference write
// or installation is performed by copying a prompt.
export const BOS_PUBLIC_PAGE = 'https://peter-jeans.github.io/BOS-site/';
export const BOS_CLIENT_PORTAL = 'https://bos-client-portal.base44.app/';
export function builderActivationPrompt({ projectRef, connectionRoute }) {
  if (!/^base44:[a-f0-9]{24}$/.test(projectRef ?? '')) throw Error('EXACT_APP_REQUIRED');
  if (!['PUBLIC', 'PRIVATE'].includes(connectionRoute)) throw Error('VERIFIED_CONNECTION_ROUTE_REQUIRED');
  const entry = connectionRoute === 'PUBLIC'
    ? 'Use the cloudbos-governed-build skill. /bind.'
    : 'Use this app’s existing private BOS connection.';
  return `${entry} Activate BOS for this Builder session in ${projectRef}. Read documents/AICONTROL.md, verify this app’s identity and governance file hashes, and restore its accepted specification, decisions and build intentions. Keep saved assistance choices unchanged. Report the BOS version, app binding, current stage and any blockers before proposing changes.`;
}

import fs from 'node:fs';
export function loadBosAppPageContract() {
  return JSON.parse(fs.readFileSync(new URL('../contracts/bos-app-page.json', import.meta.url), 'utf8'));
}
// Evaluates independently collected host observations, never authenticates them
// or intercepts app writes. Missing parts prevent a completion claim only.
export function evaluateBosPageReadback(page, { appRef, sourceRevision, connectionRoute }) {
  const contract = loadBosAppPageContract();
  const current = page?.app_ref === appRef && page.source_revision === sourceRevision
    && page.source_readback === true && page.route_readback === true
    && page.owner_admin_only === true && page.backend_access_verified === true
    && page.ui_readback === true && typeof page.route === 'string'
    && /^\/(?!\/)[A-Za-z0-9/_-]+$/.test(page.route)
    && page.standard_version === contract.version
    && contract.connection_routes.includes(connectionRoute)
    && page.connection_route === connectionRoute;
  const missing = contract.required_parts.filter(key => page?.parts?.[key]?.source_readback !== true || page.parts[key].ui_readback !== true);
  if (JSON.stringify(page?.tabs) !== JSON.stringify(contract.tabs)) missing.push('exact_tabs');
  if (page?.links?.public_page !== contract.public_page || page?.links?.client_portal !== contract.client_portal) missing.push('canonical_links');
  return { schema: 'BOS_APP_PAGE_READBACK_V1', status: current && !missing.length ? 'COMPLETE_VERIFIED' : 'PARTIAL_OR_UNVERIFIED', missing_parts: missing, app_ref: appRef, grants_mutation_authority: false, observations_are_authentication_proof: false };
}

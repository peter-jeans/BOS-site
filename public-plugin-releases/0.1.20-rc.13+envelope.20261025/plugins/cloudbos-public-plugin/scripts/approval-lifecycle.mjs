// A proposal/owner decision is durable; credentials and execution evidence are not.
// The explicit expiry discriminator fits existing TEXT storage without a fake date.
export const DURABLE_APPROVAL = 'DURABLE_EXACT_PLAN_V1';
export const UNTIL_INVALIDATED = 'UNTIL_INVALIDATED';
export const EXECUTION_EVIDENCE_MAX_AGE_MS = 5 * 60 * 1000;

export function isDurablePlan(plan) {
  return plan?.approval_lifecycle === DURABLE_APPROVAL && plan.expires_at === UNTIL_INVALIDATED;
}

export function validPlanWindow(plan) {
  if (!Number.isFinite(Date.parse(plan?.created_at))) return false;
  if (plan.approval_lifecycle !== undefined) return isDurablePlan(plan);
  const expiry = Date.parse(plan.expires_at), created = Date.parse(plan.created_at);
  return Number.isFinite(expiry) && expiry > created;
}

export function planIsCurrent(plan, now = Date.now()) {
  const at = typeof now === 'number' ? now : new Date(now).valueOf();
  return validPlanWindow(plan) && Date.parse(plan.created_at) <= at
    && (isDurablePlan(plan) || at < Date.parse(plan.expires_at));
}

export function freshExecutionEvidence(readback, now = Date.now()) {
  const at = Date.parse(readback?.verified_at);
  const current = typeof now === 'number' ? now : new Date(now).valueOf();
  return Number.isFinite(at) && at <= current && current - at <= EXECUTION_EVIDENCE_MAX_AGE_MS
    && readback?.evidence?.independent === true;
}

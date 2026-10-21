// Run against verified app records on the server or during a governed projection.
// This helper neither authenticates a caller nor grants access to source records.
export const MEMORY_SCHEMA = 'BOS_APP_MEMORY_SUMMARY_V1';
export const MEMORY_COMPONENT_VERSION = '1.0.0';
export const MEMORY_TABS = ['decisions', 'intentions', 'memory'];
const MAX_ITEMS = 30;

function text(value, limit = 480) {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1).trimEnd()}…` : cleaned;
}

function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
    && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function unavailable() { return { status: 'unavailable', items: [], total: null }; }

function item(row) {
  if (!row || typeof row !== 'object') return null;
  const title = text(row.title, 100);
  const summary = text(row.summary);
  const source = text(row.source, 160);
  if (!title || !summary || !source) return null;
  return {
    title, summary, source,
    outcome: text(row.outcome, 160),
    recorded_at: date(row.recorded_at),
  };
}

// Only supply deliberately selected, owner/admin-safe display fields here.
// Unknown fields (including raw records) are never copied into the response.
export function createMemorySummary(input, context) {
  if (context?.authenticated !== true || !['owner', 'admin'].includes(context.role)) {
    throw new Error('MEMORY_ACCESS_REQUIRED');
  }
  if (!input?.project_ref || context.project_ref !== input.project_ref) {
    throw new Error('MEMORY_PROJECT_MISMATCH');
  }
  const capturedAt = date(input.captured_at);
  if (!capturedAt) throw new Error('MEMORY_CAPTURE_TIME_REQUIRED');
  const tabs = {};
  for (const key of MEMORY_TABS) {
    const section = input.tabs?.[key];
    if (section?.status !== 'ready' || !Array.isArray(section.items)) {
      tabs[key] = unavailable();
      continue;
    }
    // Malformed data is not an empty history. Fail just the affected tab.
    const rows = section.items.map(item);
    if (rows.some(row => !row)) { tabs[key] = unavailable(); continue; }
    rows.sort((a, b) => (Date.parse(b.recorded_at) || 0) - (Date.parse(a.recorded_at) || 0));
    tabs[key] = { status: 'ready', items: rows.slice(0, MAX_ITEMS), total: rows.length };
  }
  return {
    schema: MEMORY_SCHEMA,
    project_ref: input.project_ref,
    captured_at: capturedAt,
    mode: 'snapshot',
    tabs,
  };
}

function sectionBullets(markdown, heading) {
  if (typeof markdown !== 'string') return null;
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim().toLowerCase() === `## ${heading}`);
  if (start < 0) return null;
  const values = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##?\s/.test(line)) break;
    const match = line.match(/^\s*[-*]\s+(.+)$/);
    if (match) values.push(match[1]);
  }
  return values;
}

// Translate vocabulary used by the public pack without changing its claims.
function friendly(value) {
  return value.replace(/auth-gated/gi, 'sign-in protected')
    .replace(/governance artifacts/gi, 'BOS setup records')
    .replace(/exact readback/gi, 'checking the saved setup')
    .replace(/end-to-end/gi, 'from start to finish')
    .replace(/desktop-first/gi, 'designed for desktop');
}

// The public lean pack is separate from any private development pack.
// Read its exact, verified files outside this helper; never import them in React.
export function summarizeBase44Memory(records, context) {
  const state = records?.project_state;
  if (!state || (state.project_ref !== undefined
    ? state.project_ref !== records.project_ref
    : state.project_binding_id !== records.project_ref)) {
    throw new Error('MEMORY_PROJECT_MISMATCH');
  }
  const current = sectionBullets(records.build_intentions, 'current');
  const memory = [];
  const purpose = typeof records.project_spec === 'string'
    ? records.project_spec.match(/^Purpose:\s*(.+)$/m)?.[1] : null;
  if (purpose) memory.push({ title: 'What this app is for', summary: friendly(purpose), source: 'documents/PROJECT_SPEC.md' });
  const scope = sectionBullets(records.project_spec, 'in scope');
  if (scope) scope.forEach(summary => memory.push({ title: 'Project context', summary: friendly(summary), source: 'documents/PROJECT_SPEC.md' }));
  const stages = { PROTOTYPE: 'Prototype', PRIVATE_BETA: 'Private beta', PUBLIC_BETA: 'Public beta', PRODUCTION: 'Production' };
  if (stages[state.maturation_stage]) memory.push({
    title: 'Development stage', summary: stages[state.maturation_stage], source: 'governance/PROJECT_STATE.json',
  });

  // A planned activation is not a decision. Only explicitly curated decision
  // summaries may cross into the UI; raw ledger bodies are never forwarded.
  let decisions = null;
  if (Array.isArray(records.evidence_events)) {
    decisions = records.evidence_events
      .filter(event => event?.event === 'OWNER_DECISION_RECORDED'
        && (event.project_ref !== undefined ? event.project_ref === records.project_ref : event.project_binding_id === state.project_binding_id)
        && event.display_summary?.audience === 'owner_admin')
      .map(event => ({
        title: event.display_summary.title,
        summary: event.display_summary.summary,
        outcome: event.display_summary.outcome,
        recorded_at: event.recorded_at,
        source: 'governance/EVIDENCE_LEDGER.jsonl',
      }));
  }
  const ready = items => items === null ? unavailable() : { status: 'ready', items };
  return createMemorySummary({
    project_ref: records.project_ref,
    captured_at: records.captured_at,
    tabs: {
      decisions: ready(decisions),
      intentions: ready(current?.map(summary => ({
        title: 'Current intention', summary: friendly(summary), source: 'governance/BUILD_INTENTIONS.md',
      })) ?? null),
      memory: ready(purpose && scope ? memory : null),
    },
  }, context);
}

// Validate again at the UI boundary. A mixed-up or malformed response must not
// leave the previous project's summaries on screen.
export function readMemorySummary(value, projectRef) {
  if (value?.schema !== MEMORY_SCHEMA || value.project_ref !== projectRef
    || value.mode !== 'snapshot' || !date(value.captured_at)) {
    throw new Error('MEMORY_RESPONSE_INVALID');
  }
  const tabs = {};
  for (const key of MEMORY_TABS) {
    const section = value.tabs?.[key];
    if (section?.status === 'unavailable') { tabs[key] = unavailable(); continue; }
    if (section?.status !== 'ready' || !Array.isArray(section.items)
      || section.items.length > MAX_ITEMS || !Number.isInteger(section.total)
      || section.total < section.items.length) throw new Error('MEMORY_RESPONSE_INVALID');
    const rows = section.items.map(item);
    if (rows.some(row => !row)) throw new Error('MEMORY_RESPONSE_INVALID');
    tabs[key] = { status: 'ready', items: rows, total: section.total };
  }
  return { schema: MEMORY_SCHEMA, project_ref: projectRef, captured_at: date(value.captured_at), mode: 'snapshot', tabs };
}

import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { planIsCurrent } from './approval-lifecycle.mjs';
import { restoreBase44UpdatePlanContents, validateBase44AppGovernanceProfilePlan } from './base44-app-governance-profile.mjs';

export const BASE44_UPDATE_PLAN_READBACK_FORMAT = 'BASE44_UPDATE_PLAN_READBACK_V1';
const MAX_RECIPE_BYTES = 20000;
const MAX_BASE64_CHARS = 6144;
const MAX_PLAN_BYTES = 262144;
const HASH = /^[a-f0-9]{64}$/;
const PATHS = new Set(['documents/AICONTROL.md','documents/PROJECT_SPEC.md','governance/PROJECT_STATE.json','governance/BUILD_INTENTIONS.md','governance/CAPABILITY_MANIFEST.json','governance/EVIDENCE_LEDGER.jsonl','governance/BUILD_GATES.json','governance/SECURITY_BASELINE.md','governance/GOVERNANCE_MANIFEST.json']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_,v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
function fail(code) { const error = new Error(code); error.code = code; throw error; }

// Called only after authenticated recovery of the original current D1 anchor.
// The frame contains no download credential and cannot approve or apply a plan.
export function createBase44UpdatePlanReadback(plan) {
  validateBase44AppGovernanceProfilePlan(plan);
  if (plan.requested_operation !== 'UPDATE' || plan.resume_mode || plan.repair_mode || plan.clone_mode) fail('BASE44_UPDATE_READBACK_UPDATE_ONLY');
  const original = Buffer.from(canonical(plan));
  if (original.length > MAX_PLAN_BYTES) fail('BASE44_UPDATE_READBACK_TOO_LARGE');
  const metadata = structuredClone(plan);
  const expected_prior_sha256 = Object.fromEntries(metadata.artifacts.map(x=>[x.target,x.expected_prior_sha256]));
  delete metadata.artifacts; delete metadata.update_mode.prior_artifacts;
  const recipe = Buffer.from(canonical({metadata,expected_prior_sha256}));
  if (recipe.length > MAX_RECIPE_BYTES) fail('BASE44_UPDATE_READBACK_TOO_LARGE');
  const encoded = gzipSync(recipe,{level:9}).toString('base64');
  if (encoded.length > MAX_BASE64_CHARS) fail('BASE44_UPDATE_READBACK_TOO_LARGE');
  return {schema:BASE44_UPDATE_PLAN_READBACK_FORMAT,plan_hash:plan.plan_hash,json_sha256:hash(original),json_bytes:original.length,recipe_sha256:hash(recipe),recipe_bytes:recipe.length,recipe_gzip_base64:encoded};
}

// Read-only host transport. A native assistant may pass this single compact,
// credential-free frame into code. Transcription damage fails closed on hashes;
// no model reconstructs artifacts or authority. Keep the recovered plan in code.
export async function restoreBase44UpdatePlanReadback({frame,binding,store,now=Date.now()} = {}) {
  const keys=['schema','plan_hash','json_sha256','json_bytes','recipe_sha256','recipe_bytes','recipe_gzip_base64'];
  if (!frame || Object.keys(frame).length!==keys.length || keys.some(k=>!Object.hasOwn(frame,k))
      || frame.schema!==BASE44_UPDATE_PLAN_READBACK_FORMAT || !HASH.test(frame.plan_hash??'') || !HASH.test(frame.json_sha256??'') || !HASH.test(frame.recipe_sha256??'')
      || !Number.isInteger(frame.json_bytes) || frame.json_bytes<1 || frame.json_bytes>MAX_PLAN_BYTES
      || !Number.isInteger(frame.recipe_bytes) || frame.recipe_bytes<1 || frame.recipe_bytes>MAX_RECIPE_BYTES
      || typeof frame.recipe_gzip_base64!=='string' || frame.recipe_gzip_base64.length>MAX_BASE64_CHARS
      || frame.recipe_gzip_base64.length%4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(frame.recipe_gzip_base64)) fail('BASE44_UPDATE_READBACK_FRAME_INVALID');
  let raw,recipe;
  try {
    const compressed=Buffer.from(frame.recipe_gzip_base64,'base64');
    if(compressed.toString('base64')!==frame.recipe_gzip_base64) fail('BASE44_UPDATE_READBACK_FRAME_INVALID');
    raw=gunzipSync(compressed,{maxOutputLength:MAX_RECIPE_BYTES});
    if(raw.length!==frame.recipe_bytes || hash(raw)!==frame.recipe_sha256) fail('BASE44_UPDATE_READBACK_RECIPE_MISMATCH');
    recipe=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  } catch { fail('BASE44_UPDATE_READBACK_RECIPE_MISMATCH'); }
  if (!recipe || Object.keys(recipe).sort().join(',')!=='expected_prior_sha256,metadata'
      || !recipe.expected_prior_sha256 || Array.isArray(recipe.expected_prior_sha256)) fail('BASE44_UPDATE_READBACK_FORMAT_INVALID');
  const p=recipe.metadata, hashes=recipe.expected_prior_sha256, paths=Object.keys(hashes);
  const observed=Date.parse(binding?.observed_at),age=now-observed;
  if(!p || !planIsCurrent(p,now) || !binding || !(age>=0 && age<=300000) || binding.project_ref!==`base44:${binding.app_id}`
      || p.app_id!==binding.app_id || p.project_ref!==binding.project_ref || p.project_binding_id!==binding.project_binding_id
      || p.platform_installation_id!==binding.platform_installation_id || p.expected_app_revision!==binding.expected_app_revision
      || p.plan_hash!==frame.plan_hash || p.prior_manifest_sha256!==binding.manifest_sha256
      || !HASH.test(binding.manifest_sha256??'') || !/^[a-f0-9]{40}$/.test(binding.expected_app_revision??'')) fail('BASE44_UPDATE_READBACK_CURRENT_BINDING_REQUIRED');
  if(paths.length<7 || paths.length>9 || paths.some(path=>!PATHS.has(path) || !HASH.test(hashes[path]??''))
      || hashes['governance/GOVERNANCE_MANIFEST.json']!==binding.manifest_sha256) fail('BASE44_UPDATE_READBACK_PATHS_INVALID');
  if(typeof store?.readBytes!=='function' || typeof store?.readProviderState!=='function') fail('BASE44_UPDATE_READBACK_PROVIDER_REQUIRED');
  const before=await store.readProviderState();
  if(before?.clean!==true || before.revision!==binding.expected_app_revision) fail('BASE44_UPDATE_READBACK_PROVIDER_CHANGED');
  const prior={};
  for(const path of paths){
    const bytes=await store.readBytes(path);
    if(!(bytes instanceof Uint8Array) || hash(bytes)!==hashes[path]) fail('BASE44_UPDATE_READBACK_SOURCE_CHANGED');
    prior[path]=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }
  const plan=restoreBase44UpdatePlanContents(p,prior,hashes),original=canonical(plan);
  if(Buffer.byteLength(original)!==frame.json_bytes || hash(original)!==frame.json_sha256 || plan.plan_hash!==frame.plan_hash) fail('BASE44_UPDATE_READBACK_ORIGINAL_MISMATCH');
  for(const path of paths){const bytes=await store.readBytes(path);if(!(bytes instanceof Uint8Array) || hash(bytes)!==hashes[path]) fail('BASE44_UPDATE_READBACK_SOURCE_CHANGED');}
  const after=await store.readProviderState();
  if(after?.clean!==true || after.revision!==before.revision) fail('BASE44_UPDATE_READBACK_PROVIDER_CHANGED');
  return {status:'ORIGINAL_PLAN_READBACK_VERIFIED',plan,json_sha256:frame.json_sha256,json_bytes:frame.json_bytes,approval_granted:false,app_writes:0,authentication:'HOST_AUTHENTICATED_RECOVERY_REQUIRED'};
}

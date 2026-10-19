// PROPOSAL ONLY. Host-owned public native projection; no writer or authority.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyLocalProjectBootstrap} from './local-project-bootstrap.mjs';

const HASH=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HOSTS={codex:{host:'CODEX',speaker:'Codex',connection:'CODEX_CLOUDBOS'},
  claude_code:{host:'CLAUDE_CODE',speaker:'ClaudeCode',connection:'CLAUDE_CLOUDBOS'}};
const FIXED=['.cloudbos/governance/binding.json','.cloudbos/governance/project-governance.json',
  '.cloudbos/governance/manifest.json','.cloudbos/project-memory.json','.cloudbos/host-bootstrap-manifest.json'];
const CONTROLS=['AGENTS.md','AGENTS.override.md','CLAUDE.md'];
const SPECS=['TEST_BRIEF.md','PROJECT_SPEC.md','documents/PROJECT_SPEC.md','governance/PROJECT_SPEC.json'];
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'
  ?`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')}}`:JSON.stringify(v);
const sha=v=>createHash('sha256').update(v).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const fresh=(at,now)=>Number.isFinite(Date.parse(at))&&now-Date.parse(at)>=0&&now-Date.parse(at)<=300000;
const absent={grants_authority:false,application_mutation_authorized:false,authenticates_evidence:false,
  native_instruction_loading:'NOT_OBSERVED',ongoing_assistance_controls:'UNSUPPORTED',
  changes_preferences:false,behavioural_capture:false,backlog_replay:false};

async function boundedRead(root,target) {
  if (![...FIXED,...CONTROLS,...SPECS].includes(target))fail('READBACK_PATH_NOT_ALLOWLISTED');
  let current=root;
  for (const [i,s] of target.split('/').entries()) {
    current=path.join(current,s);const stat=await fs.lstat(current);
    if(stat.isSymbolicLink())fail('READBACK_SYMLINK_DENIED');
    if(i<target.split('/').length-1&&!stat.isDirectory())fail('READBACK_PARENT_INVALID');
    if(i===target.split('/').length-1&&(!stat.isFile()||stat.size>262144))fail('READBACK_FILE_INVALID');
  }
  return fs.readFile(current,'utf8');
}
async function snapshot(root,expected,specSource) {
  const entries=Object.entries(expected??{});
  if(entries.length<6||entries.length>7||FIXED.some(p=>!Object.hasOwn(expected??{},p))
    ||entries.some(([p,h])=>![...FIXED,...CONTROLS].includes(p)||!HASH.test(h)))fail('EXACT_NATIVE_HASH_ANCHOR_REQUIRED');
  const files={};for(const [p,h] of entries){files[p]=await boundedRead(root,p);if(sha(files[p])!==h)fail('NATIVE_ARTIFACT_CHANGED');}
  const manifest=JSON.parse(files['.cloudbos/host-bootstrap-manifest.json']);
  const owned=[...FIXED,...(manifest.artifacts??[]).map(x=>x.target),...(manifest.instruction_imports??[]).map(x=>x.target)];
  if(canonical([...new Set(owned)].sort())!==canonical(entries.map(([p])=>p).sort()))fail('NATIVE_ANCHOR_SCOPE_MISMATCH');
  const memory=JSON.parse(files['.cloudbos/project-memory.json']);
  if(specSource&&!['FILE_BYTES','PUBLIC_BASELINE_CANONICAL'].includes(specSource.kind))fail('SPECIFICATION_REPRESENTATION_UNSUPPORTED');
  if(specSource?.kind==='PUBLIC_BASELINE_CANONICAL'&&specSource.path!==undefined)fail('SPECIFICATION_REPRESENTATION_CONFLICT');
  const specification=specSource?.kind==='FILE_BYTES'?await boundedRead(root,specSource.path)
    :specSource?.kind==='PUBLIC_BASELINE_CANONICAL'?canonical(memory.baseline):null;
  if(specSource?.kind==='PUBLIC_BASELINE_CANONICAL'&&(!memory.baseline
    ||sha(specification)!==memory.accepted_baseline_sha256||sha(specification)!==manifest.accepted_baseline_sha256))fail('CANONICAL_BASELINE_ANCHOR_MISMATCH');
  return {files,manifest,binding:JSON.parse(files['.cloudbos/governance/binding.json']),
    memory,specification,
    hashes:Object.fromEntries(entries.map(([p])=>[p,sha(files[p])])),
    specification_sha256:specification===null?null:sha(specification)};
}

// callTool must be the existing host's live authenticated native MCP bridge.
// Parsed content, booleans, callback timing and test fixtures cannot authenticate it.
// No new service endpoint, OAuth logic, state owner, persistent hook or selector.
export async function buildNativeResponseReadback({route,host,project_root,project_ref,
  request_context:request,expected_artifact_hashes,baseline_evidence,specification_source,
  callTool,owner_requested=false,assistance_preference,now=Date.now}={}) {
  const stop=status=>({status,...absent});
  try {
    if(route!=='public'||!HOSTS[host]||!ID.test(project_ref??''))return stop('PUBLIC_NATIVE_ROUTE_REQUIRED');
    // No saved native preference service/control exists yet. Do not convert a
    // formatting helper, supplied true flag or explicit one-shot into auto help.
    if(owner_requested!==true)return stop(assistance_preference?.cloud_enabled===false
      ||assistance_preference?.local_enabled===false?'ASSISTANCE_PAUSED':'NATIVE_AUTOMATIC_ASSISTANCE_UNSUPPORTED');
    if(typeof callTool!=='function')return stop('HOST_CONNECTION_REQUIRED');
    const start=now(),surface=HOSTS[host];
    if(!path.isAbsolute(project_root??''))return stop('EXACT_NATIVE_ROOT_REQUIRED');
    const root=await fs.realpath(project_root),stat=await fs.lstat(root);
    if(root!==path.resolve(project_root)||!stat.isDirectory())return stop('EXACT_NATIVE_ROOT_REQUIRED');
    if(!request||request.host!==surface.host||request.project_ref!==project_ref||request.selected_root!==root
      ||!HASH.test(request.request_hash??'')||!ID.test(request.chat_ref??'')
      ||/^(UNKNOWN|NONE|NULL)$/i.test(request.chat_ref)||!ID.test(request.source_revision??'')
      ||!fresh(request.observed_at,start))return stop('CURRENT_RESPONSE_CONTEXT_REQUIRED');
    for(const marker of ['.bos','BOS_PRODUCT_AUTHORITY.json']) {
      if(await fs.lstat(path.join(root,marker)).catch(e=>e.code==='ENOENT'?null:Promise.reject(e)))return stop('EXISTING_LOCAL_OR_PRIVATE_ROUTE');
    }
    const before=await snapshot(root,expected_artifact_hashes,specification_source);
    const binding=before.binding,manifest=before.manifest;
    if(binding.project_ref!==project_ref||manifest.project_ref!==project_ref||manifest.host!==host
      ||manifest.selected_root!==root||manifest.root_identity?.path!==root
      ||manifest.root_identity.device!==String(stat.dev)||manifest.root_identity.inode!==String(stat.ino)
      ||binding.project_binding_id!==manifest.project_binding_id
      ||binding.platform_installation_id!==manifest.platform_installation_id)fail('NATIVE_PROJECT_BINDING_MISMATCH');
    const captures=[];
    const bridge=async(name,args)=>{
      if(!['bos_connect','bos_capabilities','bos_project_governance_verify'].includes(name))fail('UNEXPECTED_SERVICE_ACTION');
      if(args.project_ref!==project_ref)fail('SERVICE_PROJECT_MISMATCH');
      const wire=await callTool(name,args),value=wire?.structuredContent??wire;
      if(wire?.isError||wire?.error||!value||value.tool!==name)fail('CURRENT_SERVICE_READBACK_REQUIRED');
      captures.push({name,args,value});return wire;
    };
    const connection=await verifyLocalProjectBootstrap({route,host,project_root:root,project_ref,
      callTool:bridge,baseline_evidence,owner_requested:true,assistance_preference});
    if(connection.status!=='PUBLIC_PROJECT_CONNECTION_READY'||connection.host_bootstrap!=='EXACT_FILESYSTEM_READBACK'
      ||connection.project_binding!=='GOVERNED_ACTIVE')return {...stop('NATIVE_LIFECYCLE_READBACK_REQUIRED'),
        lifecycle_status:connection.status,lifecycle_failure:connection.failure??null};
    const verify=captures.find(x=>x.name==='bos_project_governance_verify');
    const connect=captures.filter(x=>x.name==='bos_connect');
    if(connect.length!==2||!verify||verify.value.schema!=='BOS_PUBLIC_PROJECT_GOVERNANCE_TOOL_RESULT_V1'
      ||verify.value.status!=='GOVERNED_ACTIVE_VERIFIED'||verify.value.result?.readback_verified!==true
      ||verify.value.result.project_binding_id!==binding.project_binding_id
      ||verify.value.result.projection_hash!==verify.args.readback?.projection_hash
      ||verify.args.readback?.project_binding_id!==binding.project_binding_id
      ||verify.args.readback?.approved_plan_hash!==manifest.governance_plan_hash)fail('EXACT_CLOUD_BINDING_READBACK_REQUIRED');
    for(const {value:v} of connect) {
      if(v.schema!=='BOS_PUBLIC_LEVEL1_TOOL_RESULT_V1'||v.authority?.source!=='CLOUD_BOS_PUBLIC_MCP'
        ||!v.evidence?.includes('authenticated.mcp_request')||v.entitlement?.source!=='CLOUD_BOS_D1_SERVER_RESOLVED'
        ||v.entitlement?.client_claims_accepted!==false||v.result?.guidance_activation?.project_ref!==project_ref
        ||v.result?.authenticated_identity?.status!=='VERIFIED'
        ||v.result.authenticated_identity.platform_installation_id!==binding.platform_installation_id
        ||v.result.project_binding_verified!==true||v.result.project_governance_state!=='GOVERNED_ACTIVE')fail('EXACT_CLOUD_CONNECTION_REQUIRED');
    }
    const current=connect[1].value,serviceVersion=current.result.service_version;
    const version=/^(\d+)\.(\d+)(?:\.\d+)?(?:[-+][A-Za-z0-9.-]+)?$/.exec(serviceVersion??'');
    if(!version||serviceVersion!==connect[0].value.result.service_version)fail('SERVICE_VERSION_UNAVAILABLE_OR_CHANGED');
    if(current.continuity_guidance?.schema!=='BOS_CONTINUITY_GUIDANCE_V1'
      ||current.continuity_guidance.header_profile?.layout!=='TWO_HEADER_LINES_THEN_SPEAKER_CHAIN'
      ||canonical(current.continuity_guidance.header_profile.status_fields)!==canonical(['BOS','VER','AUTH','DEV','DBPP','INT','SCOPE','CONF','ROUTE_OR_TARGET'])
      ||canonical(current.continuity_guidance.header_profile.continuity_fields)!==canonical(['BIND','PHASE','EVIDENCE','CTX','LDP','ACCESS','CONN','GOVSRC','AI_ROLE']))fail('CONTINUITY_PROFILE_UNAVAILABLE');
    const after=await snapshot(root,expected_artifact_hashes,specification_source);
    if(canonical(after.hashes)!==canonical(before.hashes)||after.specification_sha256!==before.specification_sha256)fail('SOURCE_CHANGED_DURING_READBACK');
    const endRoot=await fs.lstat(root);
    if(endRoot.dev!==stat.dev||endRoot.ino!==stat.ino)fail('ROOT_CHANGED_DURING_READBACK');
    if(!fresh(request.observed_at,now()))fail('REQUEST_BECAME_STALE');
    const acceptance=current.result.specification_acceptance,receipt=acceptance?.receipt;
    const validAcceptance=acceptance?.scope==='SPECIFICATION_BASELINE'
      &&acceptance.provenance==='AUTHENTICATED_HOST_REPORTED_OWNER_DECISION'&&acceptance.grants_mutation_authority===false;
    const validReceipt=receipt&&ID.test(receipt.receipt_id??'')&&HASH.test(receipt.specification_sha256??'')
      &&ID.test(receipt.observed_revision??'')&&HASH.test(receipt.owner_decision_evidence_sha256??'')
      &&Number.isFinite(Date.parse(receipt.recorded_at));
    const specStatus=!validAcceptance?'UNKNOWN':acceptance.status==='ACCEPTED'?(validReceipt&&before.specification_sha256
      &&receipt?.specification_sha256===before.specification_sha256
      ?'ACCEPTED_CURRENT_BYTES':'EXACT_SPEC_READBACK_OR_REVISION_MISMATCH')
      :['MISSING','REVOKED','UNAVAILABLE'].includes(acceptance?.status)?acceptance.status:'UNKNOWN';
    const context={host:surface.host,project_ref,chat_ref:request.chat_ref,request_hash:request.request_hash,
      source_revision:request.source_revision,selected_root:root,root_identity:manifest.root_identity,
      project_binding_id:binding.project_binding_id,source_hashes:before.hashes,
      specification_sha256:before.specification_sha256,specification_representation:specification_source?.kind??'UNKNOWN',service_version:serviceVersion,
      specification_decision_revision:validReceipt?receipt.observed_revision:null,
      cloud_verification_sha256:sha(canonical(verify.value)),
      continuity_policy_sha256:sha(canonical(current.continuity_guidance)),specification_acceptance:specStatus,
      specification_acceptance_sha256:sha(canonical(acceptance??null))};
    const fingerprint=sha(canonical(context)),majorMinor=`${version[1]}.${version[2]}`;
    // Connection and catalogue checks are not completed guidance activation.
    const values={BOS:'!',AUTH:'!',DEV:'!',DBPP:'!',INT:'!',SCOPE:'✓',CONF:'[-----]',
      BIND:'CURRENT_PROJECT_READBACK',PHASE:'unknown/UNKNOWN',EVIDENCE:'NOT_VERIFIED',
      LDP:'UNKNOWN',ACCESS:'UNKNOWN',CONN:surface.connection,GOVSRC:'CLOUD_MEDIATED',AI_ROLE:'UNKNOWN'};
    const header=`BOS ! VER ${majorMinor} AUTH ! DEV ! DBPP ! INT ! SCOPE ✓ CONF [-----] ROUTE:CLOUDBOS_PUBLIC_NATIVE_READBACK\n`
      +`BIND:${values.BIND} PHASE:${values.PHASE} EVIDENCE:NOT_VERIFIED CTX:${fingerprint.slice(0,12)} LDP:UNKNOWN ACCESS:UNKNOWN CONN:${values.CONN} GOVSRC:CLOUD_MEDIATED AI_ROLE:UNKNOWN\n`
      +`BOS${majorMinor}> ${surface.speaker}> user>`;
    const value={project_id:project_ref,host:surface.speaker,version:majorMinor,binding:values.BIND,
      dbpp_phase:'unknown',assessment_status:'UNKNOWN',verification_status:'NOT_VERIFIED',fingerprint,
      header_fields:`LDP:UNKNOWN ACCESS:UNKNOWN CONN:${values.CONN} GOVSRC:CLOUD_MEDIATED`,
      status_fields:{...Object.fromEntries(['BOS','AUTH','DEV','DBPP','INT','SCOPE','CONF'].map(k=>[k,values[k]])),
        ROUTE:'CLOUDBOS_PUBLIC_NATIVE_READBACK'},ai_role:{role_id:'UNKNOWN',confidence:'UNKNOWN'},source_markers:[]};
    return {schema:'BOS_PUBLIC_NATIVE_RESPONSE_READBACK_V1',status:'CURRENT_PROJECT_READBACK',...absent,header,header_values:values,
      header_evidence:{...context,observed_at:request.observed_at,value},
      fingerprint,current_context:context,actual_settings_line:'Actual model/reasoning: UNKNOWN / UNKNOWN',
      specification_acceptance:specStatus,local_baseline_status:connection.project_grounding,
      specification_decision_revision:validReceipt?receipt.observed_revision:null,
      assessment_persistence:'NOT_ATTEMPTED',assistance_scope:'EXPLICIT_ONE_SHOT_ONLY',
      verification_scope:'NATIVE_KERNEL_AND_CLOUD_BINDING_ONLY',full_project_integrity:'UNKNOWN',
      source_revision_provenance:'HOST_REPORTED_REQUEST_LABEL_NOT_FULL_REPOSITORY_VERIFICATION',
      evidence_origin:'HOST_OWNED_NATIVE_BRIDGE_AND_FILESYSTEM_READBACK',
      state_effects:'NO_LOCAL_WRITES_EXISTING_CLOUD_VERIFY_AUDIT_METADATA',
      guidance_application:'NOT_OBSERVED',response_format_compliance:'NOT_OBSERVED',
      protected_workflow_result:'NOT_EVALUATED',native_hook_enforcement:'NOT_INSTALLED'};
  } catch(error) {
    const code=/^[A-Z][A-Z0-9_]{0,95}$/.test(error?.code??'')?error.code:'NATIVE_READBACK_UNAVAILABLE';
    return stop(code);
  }
}

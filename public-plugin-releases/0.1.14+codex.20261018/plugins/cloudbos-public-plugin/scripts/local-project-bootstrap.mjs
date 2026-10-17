import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateProjectGovernancePlan} from './project-governance.mjs';
import {createLocalRepositoryGovernanceStore} from './project-governance-adapters.mjs';
import {evaluatePublicProjectBaseline} from './project-baseline.mjs';
import {runPublicProjectConnection} from './project-connection.mjs';

const MEMORY='.cloudbos/project-memory.json',MANIFEST='.cloudbos/host-bootstrap-manifest.json';
const HOSTS=new Set(['codex','claude_code']);
const CONTROLS=new Set(['AGENTS.md','AGENTS.override.md','CLAUDE.md']);
const BEGIN='<!-- CLOUDBOS LOCAL PROJECT BEGIN -->',END='<!-- CLOUDBOS LOCAL PROJECT END -->';
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
const sha=v=>createHash('sha256').update(v).digest('hex');
const planHash=p=>sha(canonical(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='plan_hash'))));
const json=v=>JSON.stringify(v,null,2)+'\n';
const fail=code=>{throw Object.assign(new Error(code),{code});};

async function rootIdentity(selected){
  if(typeof selected!=='string'||!path.isAbsolute(selected))fail('EXACT_PROJECT_ROOT_REQUIRED');
  const root=await fs.realpath(selected),stat=await fs.lstat(root);
  if(root!==path.resolve(selected)||!stat.isDirectory())fail('EXACT_CANONICAL_PROJECT_ROOT_REQUIRED');
  return {path:root,device:String(stat.dev),inode:String(stat.ino)};
}
async function read(root,target){
  if(!CONTROLS.has(target)&&![MEMORY,MANIFEST].includes(target)&&!['.cloudbos/governance/binding.json','.cloudbos/governance/project-governance.json','.cloudbos/governance/manifest.json'].includes(target))fail('BOOTSTRAP_TARGET_NOT_ALLOWLISTED');
  let current=root;
  for(const [i,segment] of target.split('/').entries()){
    current=path.join(current,segment);
    try{const s=await fs.lstat(current);if(s.isSymbolicLink())fail('BOOTSTRAP_SYMLINK_DENIED');if(i<target.split('/').length-1&&!s.isDirectory())fail('BOOTSTRAP_PARENT_NOT_DIRECTORY');if(i===target.split('/').length-1&&(!s.isFile()||s.size>262144))fail('BOOTSTRAP_FILE_INVALID');}
    catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  return fs.readFile(current,'utf8');
}
async function exists(p){try{await fs.lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function requireExistingHost(root,host){
  const raw=await read(root,MANIFEST);if(raw===null)return;
  let saved;try{saved=JSON.parse(raw);}catch{fail('HOST_MANIFEST_RECONCILIATION_REQUIRED');}
  if(saved.host!==host)fail('LOCAL_PROJECT_HOST_ATTACHMENT_REQUIRED');
}
async function controlFor(root,host,profile){
  if(host==='codex')return (await read(root,'AGENTS.override.md'))?.trim()?'AGENTS.override.md':'AGENTS.md';
  // AGENTS-only requires current host evidence; never guess it from installation.
  if(profile==='CLAUDE_AGENTS_DEFAULT_SUPPORTED'){
    let d=root;
    while(true){if(await exists(path.join(d,'CLAUDE.md'))||await exists(path.join(d,'.claude/CLAUDE.md'))||await exists(path.join(d,'CLAUDE.local.md')))return 'CLAUDE.md';const parent=path.dirname(d);if(parent===d)break;d=parent;}
    return 'AGENTS.md';
  }
  return 'CLAUDE.md';
}
function mergedControl(prior,text,projectRef){
  if(prior?.includes(BEGIN)){
    if(prior.split(BEGIN).length!==2||prior.split(END).length!==2)fail('HOST_CONTROL_RECONCILIATION_REQUIRED');
    const block=prior.slice(prior.indexOf(BEGIN),prior.indexOf(END)+END.length);
    if(!block.includes(`Project reference: ${projectRef}\n`))fail('HOST_CONTROL_OTHER_PROJECT');
    // Never replace existing managed text on a resume or a newer baseline.
    if(block!==text)fail('HOST_CONTROL_RECONCILIATION_REQUIRED');
    return prior;
  }
  return (prior??'')+((prior??'').endsWith('\n')?'\n':prior?'\n\n':'')+text+'\n';
}

// Local plan only. The original authenticated service plan remains unmodified.
// The additional hash covers the precise root, native files and public memory.
export async function prepareLocalProjectBootstrap({route,project_root,project_ref,host,governance_plan,baseline_evidence,host_instruction_profile='UNKNOWN'}={}){
  if(route!=='public')fail('PUBLIC_ROUTE_NOT_SELECTED');
  if(!HOSTS.has(host))fail('LOCAL_HOST_REQUIRED');
  const identity=await rootIdentity(project_root),root=identity.path;
  if(await exists(path.join(root,'.bos'))||await exists(path.join(root,'BOS_PRODUCT_AUTHORITY.json')))fail('EXISTING_LOCAL_OR_PRIVATE_ROUTE');
  await requireExistingHost(root,host);
  validateProjectGovernancePlan(governance_plan);
  if(governance_plan.adapter_id!=='local_repository'||governance_plan.project_ref!==project_ref||!['ACTIVATE','ROLLBACK'].includes(governance_plan.requested_operation))fail('EXACT_LOCAL_GOVERNANCE_PLAN_REQUIRED');
  const baseline=evaluatePublicProjectBaseline({...baseline_evidence,project_ref});
  if(!baseline.ready_for_governance_plan)fail('CURRENT_ACCEPTED_PROJECT_BASELINE_REQUIRED');
  const binding=JSON.parse(governance_plan.artifacts.find(x=>x.role==='PROJECT_IDENTITY').proposed_content);
  const target=await controlFor(root,host,host_instruction_profile);
  let text=`${BEGIN}\nProject reference: ${project_ref}\nExact selected project root: ${root}\nRead this root's .cloudbos/governance/binding.json, project-governance.json and manifest.json, then .cloudbos/project-memory.json and host-bootstrap-manifest.json. Verify the exact project binding and current hashes before governed work.\nUse the existing authenticated public Cloud BOS connection for current capabilities and actual applicable guidance. Installation, headers and this file are not execution evidence or mutation approval. Preserve saved assistance preferences.\nInherited native instructions remain applicable; another ancestor, sibling or child project's BOS identity and approval never transfer by directory prefix. Independently selected nested projects require their own accepted baseline, approved plan and fresh binding. Never replace a private/local BOS route with this public route.\nRetain accepted requirements, decisions, exclusions and active intention; report missing or changed readback. Keep account authentication outside project files. Do not initialize Git, move folders or alter global host settings for onboarding.\n${END}`;
  let prior=await read(root,target);
  // CLAUDE suppresses AGENTS default discovery. Import a local shared file when
  // needed, preserving every existing CLAUDE byte and any ancestor CLAUDE files.
  const shared=target==='CLAUDE.md'?await read(root,'AGENTS.md'):null;
  if(shared?.includes(BEGIN)){
    if(!shared.includes(`Project reference: ${project_ref}\n`)||!shared.includes(`Exact selected project root: ${root}\n`))fail('SHARED_HOST_CONTROL_OTHER_PROJECT');
    text=`${BEGIN}\nProject reference: ${project_ref}\nExact selected project root: ${root}\n@AGENTS.md\n${END}`;
  }
  let content=mergedControl(prior,text,project_ref);
  if(shared!==null&&target==='CLAUDE.md'&&!/(?:^|\n)@(?:\.\/)?AGENTS\.md(?:\s|$)/.test(content))content+='\n@AGENTS.md\n';
  const oldMemory=await read(root,MEMORY);
  let memory;
  if(oldMemory!==null){
    try{memory=JSON.parse(oldMemory);}catch{fail('PROJECT_MEMORY_RECONCILIATION_REQUIRED');}
    if(memory.project_ref!==project_ref||memory.project_binding_id!==binding.project_binding_id||memory.selected_root!==root||memory.accepted_baseline_sha256!==baseline.current_baseline_sha256)fail('PROJECT_MEMORY_RECONCILIATION_REQUIRED');
  }else memory={schema:'CLOUDBOS_PUBLIC_LOCAL_PROJECT_MEMORY_V1',project_ref,project_binding_id:binding.project_binding_id,selected_root:root,accepted_baseline_sha256:baseline.current_baseline_sha256,provider_revision:baseline_evidence.current_revision,baseline:structuredClone(baseline_evidence.baseline),governance_plan:structuredClone(governance_plan),decisions:[],verification_limits:['Host-provided accepted baseline; physical device behavior and native instruction loading not attested'],private_ldp_restored:false};
  const item=(target,prior,content)=>({target,expected_prior_sha256:prior===null?null:sha(prior),proposed_sha256:sha(content),content});
  const kernel=[item(target,prior,content),item(MEMORY,oldMemory,oldMemory??json(memory))];
  const manifest={schema:'CLOUDBOS_LOCAL_HOST_BOOTSTRAP_MANIFEST_V1',project_ref,project_binding_id:binding.project_binding_id,platform_installation_id:binding.platform_installation_id,selected_root:root,root_identity:identity,host,governance_plan_hash:governance_plan.plan_hash,accepted_baseline_sha256:baseline.current_baseline_sha256,artifacts:kernel.map(({target,proposed_sha256})=>({target,sha256:proposed_sha256})),instruction_imports:shared===null?[]:[{target:'AGENTS.md',sha256:sha(shared)}],native_instruction_loading:'NOT_OBSERVED'};
  const oldManifest=await read(root,MANIFEST);
  if(oldManifest!==null){let saved;try{saved=JSON.parse(oldManifest);}catch{fail('HOST_MANIFEST_RECONCILIATION_REQUIRED');}if(saved.project_ref!==project_ref||saved.selected_root!==root||saved.project_binding_id!==binding.project_binding_id)fail('HOST_MANIFEST_OTHER_PROJECT');}
  kernel.push(item(MANIFEST,oldManifest,json(manifest)));
  const plan={schema:'CLOUDBOS_LOCAL_PROJECT_BOOTSTRAP_PLAN_V1',route,host,project_ref,project_binding_id:binding.project_binding_id,platform_installation_id:binding.platform_installation_id,root_identity:identity,host_instruction_profile,governance_plan:structuredClone(governance_plan),baseline_evidence:structuredClone(baseline_evidence),kernel_artifacts:kernel,instruction_imports:shared===null?[]:[{target:'AGENTS.md',sha256:sha(shared)}],zero_write:true,requires_exact_owner_approval:true,application_mutation_authorized:false};
  plan.plan_hash=planHash(plan);return plan;
}
async function check(plan,projectRoot,projectRef,host,approval){
  if(plan?.schema!=='CLOUDBOS_LOCAL_PROJECT_BOOTSTRAP_PLAN_V1'||plan.plan_hash!==planHash(plan))fail('BOOTSTRAP_PLAN_HASH_MISMATCH');
  if(plan.project_ref!==projectRef||plan.host!==host||canonical(await rootIdentity(projectRoot))!==canonical(plan.root_identity))fail('BOOTSTRAP_ROOT_OR_PROJECT_MISMATCH');
  if(approval?.approved!==true||approval.plan_hash!==plan.plan_hash||approval.project_ref!==projectRef||approval.project_binding_id!==plan.project_binding_id||approval.platform_installation_id!==plan.platform_installation_id||approval.selected_root!==plan.root_identity.path)fail('EXACT_BOOTSTRAP_APPROVAL_REQUIRED');
  validateProjectGovernancePlan(plan.governance_plan);
  if(plan.governance_plan.project_ref!==projectRef||plan.governance_plan.adapter_id!=='local_repository'||!HOSTS.has(host)||plan.route!=='public'||plan.kernel_artifacts.length!==3)fail('BOOTSTRAP_SCOPE_INVALID');
  if(await exists(path.join(plan.root_identity.path,'.bos'))||await exists(path.join(plan.root_identity.path,'BOS_PRODUCT_AUTHORITY.json')))fail('EXISTING_LOCAL_OR_PRIVATE_ROUTE');
  await requireExistingHost(plan.root_identity.path,host);
  const targets=plan.kernel_artifacts.map(x=>x.target);
  if(!CONTROLS.has(targets[0])||targets[1]!==MEMORY||targets[2]!==MANIFEST)fail('BOOTSTRAP_SCOPE_INVALID');
  if(await controlFor(plan.root_identity.path,host,plan.host_instruction_profile)!==targets[0])fail('HOST_CONTROL_DISCOVERY_CHANGED');
  for(const x of plan.instruction_imports){if(x.target!=='AGENTS.md'||sha(await read(plan.root_identity.path,x.target))!==x.sha256)fail('HOST_IMPORT_CHANGED');}
  for(const x of plan.kernel_artifacts){
    if(typeof x.content!=='string'||Buffer.byteLength(x.content)>262144||sha(x.content)!==x.proposed_sha256)fail('BOOTSTRAP_ARTIFACT_INVALID');
    const observed=await read(plan.root_identity.path,x.target),hash=observed===null?null:sha(observed);
    if(hash!==x.expected_prior_sha256&&hash!==x.proposed_sha256)fail('BOOTSTRAP_EXPECTED_STATE_CHANGED');
  }
}
async function save(plan,item){
  const root=plan.root_identity.path,current=await read(root,item.target);
  if(current!==null&&sha(current)===item.proposed_sha256)return;
  if((current===null?null:sha(current))!==item.expected_prior_sha256)fail('BOOTSTRAP_EXPECTED_STATE_CHANGED');
  const dest=path.join(root,item.target),parent=path.dirname(dest);await fs.mkdir(parent,{recursive:true,mode:0o700});
  await read(root,item.target);const temp=path.join(parent,'.cloudbos-host-'+randomUUID());
  try{
    await fs.writeFile(temp,item.content,{flag:'wx',mode:0o600});
    const before=await read(root,item.target);if((before===null?null:sha(before))!==item.expected_prior_sha256)fail('BOOTSTRAP_EXPECTED_STATE_CHANGED');
    if(item.expected_prior_sha256===null)await fs.link(temp,dest);else await fs.rename(temp,dest);
  }finally{await fs.unlink(temp).catch(()=>{});}
}
export async function activateLocalProjectBootstrap({plan,approval,project_root,project_ref,host,callTool,connection_options={}}={}){
  let connection;
  try{
    await check(plan,project_root,project_ref,host,approval);
    const store=await createLocalRepositoryGovernanceStore({project_root,project_ref,version_ref:plan.baseline_evidence.current_revision});
    connection=await runPublicProjectConnection({assistance_preference:connection_options.assistance_preference,owner_requested:connection_options.owner_requested,route:'public',host,project_ref,callTool,store,intent:'onboard',baseline_evidence:plan.baseline_evidence,current_plan:plan.governance_plan,pending_plan:plan.governance_plan,approval:{approved:true,plan_hash:plan.governance_plan.plan_hash,project_ref,project_binding_id:plan.project_binding_id,platform_installation_id:plan.platform_installation_id},approvePlan:undefined});
    if(connection.status!=='PUBLIC_PROJECT_CONNECTION_READY'||connection.project_ready!==true)return {...connection,host_bootstrap:'NOT_APPLIED',native_instruction_loading:'NOT_OBSERVED'};
    // The cloud binding may have succeeded before a host file write failed.
    // Preserve that partial state and resume only this same reviewed plan.
    await check(plan,project_root,project_ref,host,approval);
    for(const item of plan.kernel_artifacts)await save(plan,item);
    for(const item of plan.kernel_artifacts)if(sha(await read(plan.root_identity.path,item.target))!==item.proposed_sha256)fail('HOST_BOOTSTRAP_READBACK_FAILED');
    return {...connection,status:'LOCAL_PROJECT_BOOTSTRAP_VERIFIED',host_bootstrap:'EXACT_FILESYSTEM_READBACK',native_instruction_loading:'NOT_OBSERVED',native_host_ready:false,bootstrap_plan_hash:plan.plan_hash,acceptance_status:'PARTIAL_VERIFIED',application_mutation_authorized:false};
  }catch(e){return {status:'LOCAL_PROJECT_BOOTSTRAP_BLOCKED',project_ready:false,host_bootstrap:'NOT_VERIFIED',acceptance_status:connection?.project_binding==='GOVERNED_ACTIVE'?'PARTIAL_VERIFIED':'BLOCKED',failure:/^[A-Z0-9_]+$/.test(e?.code??'')?e.code:'LOCAL_BOOTSTRAP_IO_OR_READBACK_FAILED',native_instruction_loading:'NOT_OBSERVED',application_mutation_authorized:false};}
}

// Fresh-session readback never replans or writes. The original issued service
// plan survives in project memory; the server restores its own durable decision.
export async function verifyLocalProjectBootstrap({route,project_root,project_ref,host,callTool,baseline_evidence,assistance_preference,owner_requested=false}={}){
 try{
  if(route!=='public'||!HOSTS.has(host))fail('PUBLIC_LOCAL_ROUTE_REQUIRED');
  const identity=await rootIdentity(project_root),root=identity.path;
  const manifest=JSON.parse(await read(root,MANIFEST)),memory=JSON.parse(await read(root,MEMORY));
  if(manifest?.schema!=='CLOUDBOS_LOCAL_HOST_BOOTSTRAP_MANIFEST_V1'||manifest.project_ref!==project_ref||manifest.host!==host||canonical(manifest.root_identity)!==canonical(identity)||memory?.project_ref!==project_ref||memory.selected_root!==root)fail('BOOTSTRAP_ROOT_OR_PROJECT_MISMATCH');
  if(manifest.artifacts?.length!==2||!CONTROLS.has(manifest.artifacts[0].target)||manifest.artifacts[1].target!==MEMORY)fail('BOOTSTRAP_SCOPE_INVALID');
  for(const x of [...manifest.artifacts,...(manifest.instruction_imports??[])])if(sha(await read(root,x.target))!==x.sha256)fail('HOST_BOOTSTRAP_READBACK_FAILED');
  validateProjectGovernancePlan(memory.governance_plan);
  if(memory.governance_plan.plan_hash!==manifest.governance_plan_hash||memory.project_binding_id!==manifest.project_binding_id)fail('BOOTSTRAP_SCOPE_INVALID');
  const store=await createLocalRepositoryGovernanceStore({project_root:root,project_ref,version_ref:baseline_evidence?.current_revision??'working-tree'});
  const connection=await runPublicProjectConnection({route,host,project_ref,callTool,store,intent:'rebind',current_plan:memory.governance_plan,baseline_evidence,assistance_preference,owner_requested});
  return {...connection,host_bootstrap:'EXACT_FILESYSTEM_READBACK',native_instruction_loading:'NOT_OBSERVED',application_mutation_authorized:false};
 }catch(e){return {status:'LOCAL_PROJECT_BOOTSTRAP_BLOCKED',project_ready:false,host_bootstrap:'NOT_VERIFIED',failure:/^[A-Z0-9_]+$/.test(e?.code??'')?e.code:'LOCAL_BOOTSTRAP_IO_OR_READBACK_FAILED',native_instruction_loading:'NOT_OBSERVED',application_mutation_authorized:false};}
}

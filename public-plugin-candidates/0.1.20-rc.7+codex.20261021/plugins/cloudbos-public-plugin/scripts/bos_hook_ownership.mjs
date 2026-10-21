#!/usr/bin/env node
// Shared hook owner selection. Registration approval is not host hook trust.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const hash = x => createHash('sha256').update(x).digest('hex');
const encode = x => JSON.stringify(x);
const SCHEMA = 'BOS_HOOK_OWNERS_V1';
const EMPTY = {schema:SCHEMA, revision:0, registrations:[]};
export const defaultRegistry = () => path.join(os.homedir(), '.config/bos/hook-owners.json');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function regular(p) {
  const absolute=path.resolve(p);
  let cursor=path.parse(absolute).root;
  for(const component of absolute.slice(cursor.length).split(path.sep)) {
    cursor=path.join(cursor,component);
    const s=await fs.lstat(cursor).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(s?.isSymbolicLink())throw Error('SYMLINK_DENIED');
  }
  return absolute;
}
async function read(p, fallback=null) {
  await regular(p);
  try {const s=await fs.stat(p);if(!s.isFile()||s.size>1024*1024)throw Error('INVALID_FILE');return JSON.parse(await fs.readFile(p,'utf8'));}
  catch(e){if(e.code==='ENOENT')return fallback;throw e;}
}
async function atomic(p,v) {
  await regular(p);await fs.mkdir(path.dirname(p),{recursive:true,mode:0o700});await regular(p);
  const tmp=p+'.'+randomUUID();
  try {await fs.writeFile(tmp,encode(v)+'\n',{flag:'wx',mode:0o600});await fs.rename(tmp,p);}
  finally {await fs.unlink(tmp).catch(()=>{});}
}
function version(v) {
  const m=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v);
  if(!m)throw Error('INVALID_VERSION');return [...m.slice(1,4).map(Number),m[4]??''];
}
export function compareVersions(a,b) {
  const x=version(a),y=version(b);
  for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);
  if(x[3]===y[3])return 0;if(!x[3])return 1;if(!y[3])return -1;
  const l=x[3].split('.'),r=y[3].split('.');
  for(let i=0;i<Math.max(l.length,r.length);i++) {
    if(l[i]===undefined)return -1;if(r[i]===undefined)return 1;if(l[i]===r[i])continue;
    const ln=/^\d+$/.test(l[i]),rn=/^\d+$/.test(r[i]);
    if(ln&&rn)return Math.sign(Number(l[i])-Number(r[i]));
    if(ln!==rn)return ln?-1:1;return l[i]<r[i]?-1:1;
  }return 0;
}
export async function inspect(root,host) {
  if(!['codex','claude_code'].includes(host))throw Error('UNKNOWN_HOST');
  root=await fs.realpath(root);
  const manifest=await read(path.join(root,'hooks/ownership.json'));
  if(manifest?.schema!=='BOS_HOOK_PACKAGE_V1'||manifest.protocol!==1||!['local','private','public'].includes(manifest.route))throw Error('INCOMPATIBLE_PACKAGE');
  if(!manifest.handlers?.[host])throw Error('INCOMPATIBLE_HOST');
  const files=[];
  async function walk(dir) {
    for(const e of (await fs.readdir(path.join(root,dir),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      if(e.name==='__pycache__'||e.name==='.DS_Store')continue;
      const rel=path.posix.join(dir,e.name),p=path.join(root,rel);
      if(e.isSymbolicLink())throw Error('SYMLINK_DENIED');
      if(e.isDirectory())await walk(rel);else if(e.isFile())files.push([rel,hash(await fs.readFile(p))]);
    }
  }
  for(const dir of ['scripts','hooks'])await walk(dir);
  version(manifest.version);
  return {root,host,family:manifest.family,route:manifest.route,version:manifest.version,channel:manifest.channel,
    digest:hash(encode(files)),purposes:Object.keys(manifest.handlers[host]),manifest};
}
const group = r => [r.host,r.route,r.family].join(':');
export function elect(registrations, family, purpose) {
  const eligible=registrations.filter(r=>group(r)===family&&r.approved===true&&r.purposes.includes(purpose));
  if(!eligible.length)return null;
  eligible.sort((a,b)=>compareVersions(b.version,a.version));
  const tied=eligible.filter(r=>compareVersions(r.version,eligible[0].version)===0);
  if(new Set(tied.map(r=>r.digest)).size!==1)throw Error('SAME_VERSION_DIFFERENT_BYTES');
  return tied.sort((a,b)=>a.root.localeCompare(b.root))[0];
}
export function legacyRetirementPlan(hooks, selectedPluginId) {
  if(typeof selectedPluginId!=='string'||!selectedPluginId.includes('@'))throw Error('EXACT_PLUGIN_ID_REQUIRED');
  const family=selectedPluginId.split('@')[0],selected=hooks.filter(h=>h.pluginId===selectedPluginId);
  if(!selected.length)throw Error('SELECTED_PLUGIN_NOT_LOADED');
  if(selected.some(h=>!h.enabled||h.trustStatus!=='trusted'||h.isManaged))return {status:'WAITING_NATIVE_TRUST',selected_plugin:selectedPluginId,edits:[]};
  const events=new Set(selected.map(h=>h.eventName));
  const redundant=hooks.filter(h=>h.pluginId?.startsWith(family+'@')&&h.pluginId!==selectedPluginId&&events.has(h.eventName)&&h.enabled);
  if(redundant.some(h=>h.isManaged))throw Error('MANAGED_HOOK_CANNOT_BE_RETIRED');
  return {status:'READY_FOR_EXACT_HOST_PLAN',selected_plugin:selectedPluginId,
    selected_hashes:selected.map(h=>({key:h.key,hash:h.currentHash})),
    retire:redundant.map(h=>({key:h.key,hash:h.currentHash,source:h.sourcePath})),
    edits:[{keyPath:'hooks.state',mergeStrategy:'upsert',value:Object.fromEntries(redundant.map(h=>[h.key,{enabled:false}]))}],
    invariant:'Preserve trusted hashes and all unrelated plugin, MCP and project settings; reread host hashes and config version immediately before applying.'};
}
export async function plan(roots,host,registry=defaultRegistry(),channels=['stable']) {
  const prior=await read(registry,EMPTY);
  if(prior.schema!==SCHEMA)throw Error('INVALID_REGISTRY');
  const incoming=[];
  for(const root of roots) {
    const {manifest,...entry}=await inspect(root,host);
    if(!channels.includes(entry.channel)||version(entry.version)[3]&&entry.channel==='stable')throw Error('CHANNEL_APPROVAL_REQUIRED');
    incoming.push({...entry,approved:true});
  }
  const replaced=new Set(incoming.map(r=>r.root+':'+r.host));
  const desired={schema:SCHEMA,revision:prior.revision+1,registrations:[...prior.registrations.filter(r=>!replaced.has(r.root+':'+r.host)),...incoming]};
  const owners=[];
  for(const r of desired.registrations)for(const purpose of r.purposes) {
    const owner=elect(desired.registrations,group(r),purpose);
    if(owner&&!owners.some(x=>x.key===group(r)+':'+purpose))owners.push({key:group(r)+':'+purpose,root:owner.root,version:owner.version});
  }
  const result={schema:'BOS_HOOK_OWNER_PLAN_V1',registry:path.resolve(registry),prior_digest:hash(encode(prior)),desired,owners,
    host_trust:'SEPARATE_USER_REVIEW_REQUIRED',legacy_hooks:'MIGRATE_OR_DISABLE_LEGACY_REGISTRATIONS_BEFORE_CLAIMING_EXCLUSIVE_EXECUTION'};
  return {...result,plan_digest:hash(encode(result))};
}
export async function apply(p,digest,nativeReadback) {
  const {plan_digest,...body}=p;
  if(plan_digest!==digest||hash(encode(body))!==digest)throw Error('EXACT_PLAN_APPROVAL_REQUIRED');
  const nativeHooks=nativeReadback?.data?.flatMap(x=>x.hooks??[])??[];
  for(const owner of p.owners) {
    const r=p.desired.registrations.find(x=>x.root===owner.root&&owner.key.startsWith(group(x)+':'));
    // Registry ownership must never suppress a working predecessor before the
    // selected successor has passed the host's independent trust gate.
    if(r.host!=='codex')throw Error('NATIVE_TRUST_ADAPTER_REQUIRED');
    const event=owner.key.slice(group(r).length+1).replaceAll('_','').toLowerCase();
    if(!nativeHooks.some(h=>h.enabled===true&&h.trustStatus==='trusted'&&typeof h.currentHash==='string'
      &&h.sourcePath?.startsWith(r.root+path.sep)&&h.eventName?.replaceAll('_','').toLowerCase()===event))throw Error('NATIVE_TRUST_REQUIRED');
  }
  const registry=p.registry;await regular(registry);await fs.mkdir(path.dirname(registry),{recursive:true,mode:0o700});
  const lock=await fs.open(registry+'.lock','wx',0o600);
  try {
    const current=await read(registry,EMPTY);
    if(hash(encode(current))!==p.prior_digest)throw Error('STALE_PLAN');
    for(const r of p.desired.registrations) {const now=await inspect(r.root,r.host);if(now.digest!==r.digest)throw Error('PACKAGE_CHANGED');}
    await atomic(registry+'.backup-'+current.revision,current);
    await atomic(registry,p.desired);
  }finally{await lock.close();await fs.unlink(registry+'.lock');}
  return {status:'OWNERS_SELECTED_HOST_TRUST_SEPARATE',revision:p.desired.revision};
}
export async function status(registry=defaultRegistry()) {
  const state=await read(registry,EMPTY),rows=[];
  for(const r of state.registrations) {
    let valid=false;try{valid=(await inspect(r.root,r.host)).digest===r.digest;}catch{}
    for(const purpose of r.purposes) {
      let owner;try{owner=elect(state.registrations,group(r),purpose);}catch{}
      rows.push({plugin:r.family,route:r.route,host:r.host,purpose,version:r.version,root:r.root,channel:r.channel,
        status:!valid?'CHANGED_OR_MISSING':!r.approved?'AWAITING_APPROVAL':!owner?'CONFLICT':owner.root===r.root?'ACTIVE_OWNER':'SUPERSEDED',
        superseded_by:owner?.root!==r.root?owner?.root:null,host_trust:'NOT_ATTESTED_BY_REGISTRY'});
    }
  }return rows;
}
export async function guard(root,host,event,execute,{registry=defaultRegistry(),waitMs=3500}={}) {
  const own=await inspect(root,host),state=await read(registry,EMPTY),purpose=event.hook_event_name;
  const owner=elect(state.registrations,group(own),purpose);
  if(!owner)return purpose==='PreToolUse'?deny('BOS hook owner setup pending; this Cloud call has not been checked.'):{systemMessage:'BOS hook owner setup pending; no hook work performed. Ordinary authorized work can continue.'};
  if(owner.root!==own.root)return {};
  if(owner.digest!==own.digest)throw Error('APPROVED_PACKAGE_CHANGED');
  if(typeof event.session_id!=='string'||!event.session_id||!path.isAbsolute(event.cwd??''))throw Error('EXACT_SESSION_PROJECT_REQUIRED');
  const project=await fs.realpath(event.cwd);
  // Never use raw prompts, tool arguments or project paths as filenames or receipts.
  const stableEvent=event.tool_use_id??event.tool_call_id??event.turn_id??null;
  if(purpose==='PreToolUse'&&!stableEvent)return deny('BOS needs an exact tool or turn identifier to safely check this Cloud call.');
  const identity=[group(own),host,project,event.session_id,event.turn_id??null,purpose,event.tool_use_id??event.tool_call_id??null,
    hash(encode([event.prompt??null,event.tool_name??null,event.tool_input??null,event.tool_response??null,event.last_assistant_message??null,event.stop_hook_active??false]))];
  const key=hash(encode(identity)),dir=path.join(path.dirname(registry),'hook-events',hash(event.session_id));
  await regular(dir);await fs.mkdir(dir,{recursive:true,mode:0o700});await regular(dir);
  const receipt=path.join(dir,key+'.json'),lockPath=path.join(dir,key+'.lock');
  async function duplicate() {
    if(purpose!=='PreToolUse')return {};
    const end=Date.now()+waitMs;
    while(Date.now()<end) {const done=await read(receipt);if(done)return done.permission_result??deny('BOS hook check did not complete; retry this operation.');await pause(25);}
    return deny('BOS hook check is already running or incomplete; retry this operation.');
  }
  let lock;try{lock=await fs.open(lockPath,'wx',0o600);}catch(e){if(e.code==='EEXIST')return duplicate();throw e;}
  // Retain the claim for this exact event, including after a crash: never repeat effects automatically.
  try {
    const output=await execute();
    await atomic(receipt,{status:'COMPLETED',owner_digest:own.digest,...(purpose==='PreToolUse'?{permission_result:output}:{})});
    return output;
  }catch(e){await atomic(receipt,{status:'FAILED',owner_digest:own.digest});throw e;}
  finally{await lock.close();if(!stableEvent)await fs.unlink(lockPath);}
}
const deny = text => ({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:text}});
async function delegate(root,host,event) {
  const p=await read(path.join(root,'hooks/ownership.json'));
  const args=p.handlers[host]?.[event.hook_event_name];if(!args)return {};
  const argv=args.map(x=>x.replaceAll('${PLUGIN_ROOT}',root));
  return new Promise((resolve,reject)=>{
    const child=spawn(argv[0],argv.slice(1),{cwd:event.cwd,stdio:['pipe','pipe','pipe'],shell:false});
    let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('DELEGATE_TIMEOUT'));},p.timeout_ms??180000);
    child.stdout.on('data',x=>{out+=x;if(out.length>1024*1024){child.kill();reject(Error('OUTPUT_TOO_LARGE'));}});
    child.stderr.on('data',x=>{err=(err+x).slice(-4096);});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('DELEGATE_FAILED'));try{resolve(JSON.parse(out));}catch{reject(Error('INVALID_DELEGATE_OUTPUT'));}});
    child.stdin.on('error',()=>{});child.stdin.end(encode(event));
  });
}
async function main() {
  const args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1],mode=args[0];
  if(mode==='plan') {
    const roots=args.flatMap((x,i)=>x==='--root'?[args[i+1]]:[]);
    if(!roots.length)throw Error('ROOT_REQUIRED');
    console.log(encode(await plan(roots,option('--host'),args.includes('--registry')?option('--registry'):undefined,args.includes('--channel')?[option('--channel')]:undefined)));return;
  }
  if(mode==='apply'){
    const evidence=option('--host-readback');if(!args.includes('--host-readback'))throw Error('NATIVE_TRUST_REQUIRED');
    const age=Date.now()-(await fs.stat(evidence)).mtimeMs;if(age<0||age>300000)throw Error('FRESH_NATIVE_READBACK_REQUIRED');
    console.log(encode(await apply(await read(option('--plan')),option('--approve-digest'),await read(evidence))));return;
  }
  if(mode==='status'){console.log(encode(await status(args.includes('--registry')?option('--registry'):undefined)));return;}
  if(mode==='legacy-plan') {
    const live=await read(option('--host-readback'));
    console.log(encode(legacyRetirementPlan(live.data.flatMap(x=>x.hooks),option('--selected-plugin'))));return;
  }
  if(mode!=='run')throw Error('UNKNOWN_OPERATION');
  let bytes=0,raw='';for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>65536)throw Error('HOOK_INPUT_TOO_LARGE');raw+=chunk;}
  const event=JSON.parse(raw),host=option('--host'),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  try{console.log(encode(await guard(root,host,event,()=>delegate(root,host,event))));}
  catch{console.log(encode(event.hook_event_name==='PreToolUse'?deny('BOS hook ownership or evidence needs review; this Cloud call was not checked.'):{systemMessage:'BOS hook ownership check unavailable; no governance success is claimed. Ordinary authorized work can continue.'}));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('BOS hook manager failed; no success claimed.');process.exitCode=1;});

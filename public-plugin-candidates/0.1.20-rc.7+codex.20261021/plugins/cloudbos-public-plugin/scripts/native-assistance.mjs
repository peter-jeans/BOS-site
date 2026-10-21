#!/usr/bin/env node
// Project-owned controls and bounded hook context, never credentials or a client.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';

const HOSTS=new Set(['codex','claude_code']);
const PREF='.cloudbos/assistance-preference.json', SESSIONS='.cloudbos/assistance-sessions';
const SCHEMA='BOS_NATIVE_ASSISTANCE_PREFERENCE_V1', STATE='BOS_NATIVE_ASSISTANCE_SESSION_V1';
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const sha=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const absent=status=>({status,local_enabled:null,cloud_enabled:null,revision:0,grants_authority:false});
const publicTools=new Set(['connect','capabilities','assess_project','project_spec_check','maturity_next','scan_plan','scanfix_plan','health_snapshot','project_discover','project_governance_plan','project_governance_decision','project_governance_activate','project_governance_verify','project_governance_remove','project_app_status_access','assistance_preference','record_capability_usage'].map(x=>'bos_'+x));

async function read(root,rel,limit=65536) {
  let p=root;
  for(const part of rel.split('/')) {
    p=path.join(p,part);
    const stat=await fs.lstat(p).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
    if(!stat)return null;
    if(stat.isSymbolicLink())fail('NATIVE_ASSISTANCE_SYMLINK_DENIED');
    if(p!==path.join(root,rel)&&!stat.isDirectory())fail('NATIVE_ASSISTANCE_PATH_INVALID');
    if(p===path.join(root,rel)&&(!stat.isFile()||stat.size>limit))fail('NATIVE_ASSISTANCE_FILE_INVALID');
  }
  return fs.readFile(p,'utf8');
}
async function directory(root,rel) {
  let p=root;
  for(const part of rel.split('/')) {
    p=path.join(p,part);await fs.mkdir(p,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
    const s=await fs.lstat(p);if(s.isSymbolicLink()||!s.isDirectory())fail('NATIVE_ASSISTANCE_PATH_INVALID');
  }
  return p;
}
async function atomic(root,rel,value) {
  const parent=await directory(root,path.dirname(rel));await read(root,rel);
  const temp=path.join(parent,'.assistance-'+randomUUID());
  try {await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await fs.rename(temp,path.join(root,rel));}
  finally {await fs.unlink(temp).catch(()=>{});}
}
export async function nativeProjectContext(project_root,host) {
  if(!HOSTS.has(host)||!path.isAbsolute(project_root??''))fail('EXACT_NATIVE_HOST_ROOT_REQUIRED');
  const root=await fs.realpath(project_root),stat=await fs.lstat(root);
  if(root!==path.resolve(project_root)||!stat.isDirectory())fail('EXACT_NATIVE_HOST_ROOT_REQUIRED');
  for(const marker of ['.bos','BOS_PRODUCT_AUTHORITY.json']) {
    if(await fs.lstat(path.join(root,marker)).catch(e=>e.code==='ENOENT'?null:Promise.reject(e)))fail('EXISTING_LOCAL_OR_PRIVATE_ROUTE');
  }
  const binding=JSON.parse(await read(root,'.cloudbos/governance/binding.json')??'null');
  const manifest=JSON.parse(await read(root,'.cloudbos/host-bootstrap-manifest.json')??'null');
  if(!binding||!manifest||binding.schema!=='BOS_CLOUDBOS_PUBLIC_PROJECT_BINDING_V1'
    ||manifest.schema!=='CLOUDBOS_LOCAL_HOST_BOOTSTRAP_MANIFEST_V1'
    ||![binding.project_ref,binding.project_binding_id,binding.platform_installation_id].every(x=>ID.test(x??''))
    ||!/^([a-f0-9]{64})$/.test(manifest.accepted_baseline_sha256??'')
    ||manifest.host!==host||manifest.project_ref!==binding.project_ref
    ||manifest.project_binding_id!==binding.project_binding_id||manifest.platform_installation_id!==binding.platform_installation_id
    ||manifest.selected_root!==root||manifest.root_identity?.path!==root
    ||manifest.root_identity.device!==String(stat.dev)||manifest.root_identity.inode!==String(stat.ino))fail('NATIVE_PROJECT_BINDING_REQUIRED');
  const identity={path:root,device:String(stat.dev),inode:String(stat.ino)};
  return {root,host,binding,identity,baseline_sha256:manifest.accepted_baseline_sha256,evidence_key:sha(canonical([manifest,binding])),
    key:sha(canonical([host,identity,binding.project_ref,binding.project_binding_id,binding.platform_installation_id]))};
}
function matches(value,ctx) {
  const fields=['schema','host','project_ref','project_binding_id','platform_installation_id','root_identity','local_enabled','cloud_enabled','revision','app_revision','paused','resume_choices'];
  return value?.schema===SCHEMA&&Object.keys(value).every(k=>fields.includes(k))
    &&value.host===ctx.host&&value.project_ref===ctx.binding.project_ref
    &&value.project_binding_id===ctx.binding.project_binding_id&&value.platform_installation_id===ctx.binding.platform_installation_id
    &&Object.entries(ctx.identity).every(([k,v])=>value.root_identity?.[k]===v)&&typeof value.local_enabled==='boolean'
    &&Object.keys(value.root_identity??{}).every(k=>['path','device','inode'].includes(k))
    &&typeof value.cloud_enabled==='boolean'&&Number.isSafeInteger(value.revision)&&value.revision>0
    &&/^native-[1-9][0-9]*-[a-f0-9]{24}$/.test(value.app_revision??'')
    &&(value.paused===undefined||typeof value.paused==='boolean')
    &&(!value.paused||!value.local_enabled&&!value.cloud_enabled)
    &&(value.resume_choices==null||typeof value.resume_choices.local_enabled==='boolean'&&typeof value.resume_choices.cloud_enabled==='boolean'
      &&Object.keys(value.resume_choices).every(k=>['local_enabled','cloud_enabled'].includes(k)));
}
export async function readNativeAssistance({project_root,host}={}) {
  try {
    const ctx=await nativeProjectContext(project_root,host),raw=await read(ctx.root,PREF,8192);
    if(raw===null)return {...absent('NO_SAVED_CHOICE'),project_ref:ctx.binding.project_ref};
    const value=JSON.parse(raw);if(!matches(value,ctx))return {...absent('SAVED_CHOICE_NOT_CURRENT'),project_ref:ctx.binding.project_ref};
    return {...value,status:'SAVED_CHOICE_READ_BACK',grants_authority:false,cloud_projection:'NOT_ATTESTED'};
  } catch(e) {return {...absent('NATIVE_CHOICE_UNAVAILABLE'),reason:/^[A-Z_]+$/.test(e.code??'')?e.code:'NATIVE_CHOICE_UNREADABLE'};}
}
export async function setNativeAssistance({project_root,host,local_enabled,cloud_enabled,expected_revision,operation='set'}={}) {
  if(!['set','pause','resume'].includes(operation)||operation==='set'&&(typeof local_enabled!=='boolean'||typeof cloud_enabled!=='boolean')
    ||!Number.isSafeInteger(expected_revision)||expected_revision<0)fail('EXPLICIT_LOCAL_CLOUD_CHOICES_AND_REVISION_REQUIRED');
  const ctx=await nativeProjectContext(project_root,host),parent=await directory(ctx.root,'.cloudbos');
  const lock=path.join(parent,'assistance-preference.lock');let handle;
  try {handle=await fs.open(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('NATIVE_CHOICE_WRITER_BUSY');throw e;}
  try {
    const prior=await readNativeAssistance({project_root:ctx.root,host});
    if(!['NO_SAVED_CHOICE','SAVED_CHOICE_READ_BACK'].includes(prior.status))fail('NATIVE_CHOICE_RECONCILIATION_REQUIRED');
    if(prior.revision!==expected_revision)fail('NATIVE_CHOICE_REVISION_CONFLICT');
    if(operation==='pause'&&prior.paused===true)return prior;
    if(operation==='resume'&&prior.status==='SAVED_CHOICE_READ_BACK'&&(prior.local_enabled||prior.cloud_enabled))return prior;
    if(operation==='resume') {
      if(!prior.resume_choices)fail('NATIVE_RESUME_CHOICES_UNKNOWN');
      ({local_enabled,cloud_enabled}=prior.resume_choices);
    } else if(operation==='pause') {local_enabled=false;cloud_enabled=false;}
    const paused=!local_enabled&&!cloud_enabled;
    const resume_choices=paused?(prior.local_enabled===true||prior.cloud_enabled===true
      ?{local_enabled:prior.local_enabled,cloud_enabled:prior.cloud_enabled}:prior.resume_choices??null):null;
    const check=await nativeProjectContext(ctx.root,host);if(check.key!==ctx.key)fail('NATIVE_PROJECT_CHANGED');
    const revision=prior.revision+1,value={schema:SCHEMA,host,project_ref:ctx.binding.project_ref,
      project_binding_id:ctx.binding.project_binding_id,platform_installation_id:ctx.binding.platform_installation_id,
      root_identity:ctx.identity,local_enabled,cloud_enabled,paused,resume_choices,revision};
    value.app_revision='native-'+revision+'-'+sha(canonical(value)).slice(0,24);
    await atomic(ctx.root,PREF,value);
    // Paused control state is not a backlog. Delete only our validated session records.
    if(!local_enabled&&!cloud_enabled) {
      const dir=path.join(ctx.root,SESSIONS),stat=await fs.lstat(dir).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
      if(stat?.isDirectory()&&!stat.isSymbolicLink())for(const name of (await fs.readdir(dir)).slice(0,256)) {
        if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
        const raw=await read(ctx.root,SESSIONS+'/'+name,8192);let s;try{s=raw?JSON.parse(raw):null;}catch{continue;}
        if(s?.schema===STATE&&s.context_key===ctx.key)await fs.unlink(path.join(dir,name));
      }
    }
    return readNativeAssistance({project_root:ctx.root,host});
  } finally {await handle.close();await fs.unlink(lock).catch(()=>{});}
}
function intentText(prompt) {
  // Literal examples are data, not fresh assistance authorization.
  return prompt.replace(/```[\s\S]*?```/g,' ').replace(/<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content>/gi,' ')
    .replace(/`[^`]*`|"[^"\n]*"|'[^'\n]*'/g,' ').replace(/^\s*>.*$/gm,' ').trim();
}
function requested(prompt,host) {
  const text=intentText(prompt);
  if(/\b(?:do not|don't|never|without)\s+(?:use\s+)?(?:cloud\s*)?bos\b/i.test(text))return false;
  if(host==='claude_code'&&(/^(?:(?:please|can you|could you|would you)\s+)?(?:connect|start)\s+(?:cloud\s*)?bos\b/i.test(text)
    ||/^bos\s+(?:connect|start|activate)\b/i.test(text)))return true;
  return /^(?:(?:please|can you|could you|would you)\s+)?(?:use|ask|consult|run|check|activate)\s+(?:cloud\s*)?bos\b/i.test(text)
    ||/^\/(?:bos|scan|scanfix|assist|onboard|bind)\b/i.test(text)||/^bos\s+(?:once|please|help|scan|assist|verify|review|check)\b/i.test(text);
}
function signal(prompt,failures) {
  prompt=intentText(prompt);
  if(failures>=2||/\b(?:still failing|failed again|same error|repeated failures?|third (?:try|time)|failed twice|keeps breaking)\b/i.test(prompt))return 'REPEATED_FAILURE';
  if(/\b(?:rename|edit|change)\b.{0,50}\b(?:label|caption|button text)\b/i.test(prompt)
    &&!/\b(?:grant|revoke|enforce|authorize|policy|business rule|tenant boundary)\b/i.test(prompt))return null;
  if(/\b(?:tenant|permissions?|access control|roles?|architecture|migrat(?:e|ion)|destructive|delete all|billing|authentication)\b/i.test(prompt))return 'CONSEQUENTIAL_CHANGE';
  if(/\b(?:inconsistent|wrong totals?|conflicting rules?|frontend.{0,20}backend|data loss|duplicate saves?)\b/i.test(prompt))return 'RULE_OR_DATA_CONSISTENCY';
  if(/\b(?:not verified|not tested|skip tests?|missing verification|without testing)\b/i.test(prompt))return 'VERIFICATION_GAP';
  if(/\b(?:android|ios|bluetooth|offline|background execution|windows compatibility|device support)\b/i.test(prompt))return 'PLATFORM_LIMIT';
  if(/\b(?:typo|cosmetic|button colou?r|rename (?:a |the )?label|spacing|font size)\b/i.test(prompt))return null;
  if(/\b(?:resume|continue|where (?:we|I) left off|previous decisions?)\b/i.test(prompt))return 'CONTINUITY';
  return null;
}
const contextOutput=(event,text)=>({hookSpecificOutput:{hookEventName:event.hook_event_name,additionalContext:text}});
const controlOnly=(event,pref)=>contextOutput(event,JSON.stringify({schema:'BOS_NATIVE_ASSISTANCE_CONTROL_READBACK_V1',purpose:'CONTROL_ONLY',
  local_enabled:pref.local_enabled,cloud_enabled:pref.cloud_enabled,automatic_help:false,capture:false})
  +'\nRespect this saved Off/unknown choice before discretionary BOS instructions. Continue ordinary authorized work and actual app security without optional BOS gates, envelopes, guidance calls or capture. Do not ask for another choice or approval unless the owner requests a change. No pause backlog is queued.');
const denied=reason=>({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:reason}});
const nativeSkill=host=>host==='claude_code'
  ?{identifier:'cloudbos-public-plugin:bos',path:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../claude-skills/bos/SKILL.md')}
  :{identifier:'cloudbos-public-plugin:cloudbos-public-guide',path:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../skills/cloudbos-public-guide/SKILL.md')};
export function nativeToolResult(wire) {
  if(typeof wire==='string') {if(wire.length>65536)return null;try{wire=JSON.parse(wire);}catch{return null;}}
  if(!wire||wire.isError||wire.is_error||wire.error)return null;
  if(wire.structuredContent)return wire.structuredContent;
  if(Array.isArray(wire.content)) {try{return JSON.parse(wire.content.find(x=>x.type==='text')?.text??'null');}catch{return null;}}
  return wire;
}
// This projection must come from the existing authenticated preference READ.
// Its native route must be qualified against the staged service's enrollment
// gate. A schema listing or caller-supplied On/Off flag is not that readback.
export function nativeOneShotProjectionMatches(value,pref,project_ref) {
  if(value?.schema!=='BOS_ASSISTANCE_CLOUD_PREFERENCE_V1'||value.project_ref!==project_ref)return false;
  if(pref.status==='NO_SAVED_CHOICE')return value.status==='NO_SAVED_CHOICE'&&value.revision===0
    &&value.local_enabled===null&&value.cloud_enabled===null&&value.app_revision===null;
  return pref.status==='SAVED_CHOICE_READ_BACK'&&pref.cloud_enabled===false
    &&value.status==='ACKNOWLEDGED'&&Number.isSafeInteger(value.revision)&&value.revision>0
    &&value.app_revision===pref.app_revision&&value.local_enabled===pref.local_enabled&&value.cloud_enabled===false;
}
export async function nativeAssistanceEvent(event={}, {host,now=Date.now}={}) {
  let ctx;try{ctx=await nativeProjectContext(event.cwd,host);}catch{return {};}
  const pref=await readNativeAssistance({project_root:ctx.root,host});
  const known=pref.status==='SAVED_CHOICE_READ_BACK',enabled=known&&(pref.local_enabled||pref.cloud_enabled);
  const id=typeof event.session_id==='string'&&event.session_id.length<=256?event.session_id:null;
  if(!id)return {};
  const rel=SESSIONS+'/'+sha(host+':'+id)+'.json';let state;
  try {state=JSON.parse(await read(ctx.root,rel,8192)??'null');}catch{state=null;}
  if(state?.schema!==STATE||state.context_key!==ctx.key||state.preference_revision!==pref.revision)state={schema:STATE,context_key:ctx.key,one_shot:false,failures:0,signals:{}};
  state={schema:STATE,context_key:ctx.key,preference_revision:pref.revision,one_shot:state.one_shot===true,
    one_shot_cloud_ready:state.one_shot_cloud_ready===true,
    task_hash:/^[a-f0-9]{64}$/.test(state.task_hash??'')?state.task_hash:null,
    failure_key:/^[a-f0-9]{64}$/.test(state.failure_key??'')?state.failure_key:null,
    failures:Number.isInteger(state.failures)&&state.failures>=0&&state.failures<=3?state.failures:0,
    signals:Object.fromEntries(Object.entries(state.signals??{}).filter(([k,v])=>/^[a-f0-9]{64}$/.test(k)&&Number.isFinite(v)).slice(-16)),
    control_pending:state.control_pending===true,
    choice_revision:Number.isSafeInteger(state.choice_revision)?state.choice_revision:pref.revision,
    turn_id:typeof state.turn_id==='string'&&state.turn_id.length<=256?state.turn_id:null};
  const remove=async()=>{if(await read(ctx.root,rel,8192)!==null)await fs.unlink(path.join(ctx.root,rel));};
  const save=()=>atomic(ctx.root,rel,state.one_shot||state.control_pending
    ?{schema:STATE,context_key:ctx.key,preference_revision:pref.revision,one_shot:state.one_shot,control_pending:state.control_pending,turn_id:state.turn_id,
      ...(state.one_shot_cloud_ready?{one_shot_cloud_ready:true}:{}),
      ...(state.control_pending?{choice_revision:state.choice_revision}:{})}:state);
  const eventName=event.hook_event_name;
  if(eventName==='SessionEnd'){await remove();return {};}
  if(eventName==='Stop') {if(!enabled)await remove();else if(state.one_shot||state.control_pending){state.one_shot=false;state.control_pending=false;await save();}return {};}
  if(eventName==='SessionStart') {
    if(!enabled){await remove();return controlOnly(event,pref);}
    state.one_shot=false;state.control_pending=false;state.turn_id=null;await save();
    if(host==='claude_code'&&pref.cloud_enabled)return contextOutput(event,JSON.stringify({purpose:'CLAUDE_BOS_STANDING_ASSISTANCE',skill:nativeSkill(host),project_ref:ctx.binding.project_ref,local_enabled:pref.local_enabled,cloud_enabled:true})
      +'\nSaved Cloud On is the owner\'s standing request for relevant read-only BOS consultation during ordinary planning, continuity and repair work. The next prompt need not repeat BOS. Use the native Skill entry above on a relevant task; simple cosmetic work needs no Cloud consultation. Restore this exact baseline and unfinished checks. This is no new app-write authority, preference change, authentication or implementation-scope grant.');
    return contextOutput(event,`Cloud BOS native choices read back for ${ctx.binding.project_ref}: Local=${pref.local_enabled}, Cloud=${pref.cloud_enabled}. On the next relevant task restore this exact project's accepted baseline, decisions and unfinished checks. Do not fetch Cloud guidance for a purely cosmetic task. Saved choice is not authentication, entitlement, observed behavior or new action authority. Use the installed public guide, not another project's instructions.`);
  }
  if(eventName==='PreToolUse') {
    const name=String(event.tool_name??''),tool=[...publicTools].find(t=>name===t||name.endsWith('__'+t));
    if(!tool||(!name.includes('cloudbos')&&!name.startsWith('bos_')))return {};
    const args=event.tool_input??{};
    if(args.project_ref!==ctx.binding.project_ref)return denied('Cloud BOS requires the exact current project_ref. Restore the exact binding; ordinary work can continue.');
    if(tool==='bos_assistance_preference')return {}; // READ/SYNC controls remain available while paused.
    if(state.control_pending&&state.choice_revision===pref.revision&&(!event.turn_id||!state.turn_id||event.turn_id===state.turn_id))return denied('Finish the requested assistance-control save/readback and compact preference sync only. No guidance before saving a pause/resume choice; ordinary work continues.');
    const one=state.one_shot===true&&(!event.turn_id||!state.turn_id||event.turn_id===state.turn_id);
    if(tool==='bos_record_capability_usage'&&(!known||!pref.cloud_enabled||one))return denied('No new BOS behavioral recording for unknown/Cloud-off or one-shot assistance; do not queue or replay it.');
    if(one&&!(known&&pref.cloud_enabled)&&!state.one_shot_cloud_ready)return denied('Before paused/unknown one-shot Cloud guidance, READ the exact project through bos_assistance_preference. Verify the enrolled service protection and matching saved Off projection; schema availability alone is insufficient. Sync an actually saved choice only with current CAS and never overwrite a newer Cloud choice. If unavailable, keep Cloud guidance pending and continue requested local/ordinary work.');
    if(known&&pref.cloud_enabled||one)return {}; // Normal host permissions and service gates still decide.
    return denied('Saved Cloud BOS choice is Off or unknown. No automatic Cloud guidance; ordinary app work and security continue. An explicit one-shot does not change the saved choice.');
  }
  if(eventName==='UserPromptSubmit') {
    const prompt=typeof event.prompt==='string'?event.prompt:'';
    const text=intentText(prompt);
    const controls=!(host==='claude_code'&&/^(?:please\s+)?(?:do not|don't|never)\b/i.test(text))&&(
      host==='claude_code'&&/^(?:please\s+)?use\s+bos\s+while\s+i\s+work[.!]?$/i.test(text)
      ||
      /^(?:(?:please|can you|could you|would you)\s+)?(?:pause|stop|resume)\s+(?:cloud\s*)?bos\b/i.test(text)
      ||/^(?:(?:please|can you|could you|would you)\s+)?(?:turn|switch)\s+(?:cloud\s*)?bos\s+off\b/i.test(text)
      ||/\bbos\b/i.test(text)&&(/\b(?:set|save|change|update)\b.{0,30}\b(?:assistance|preferences?|choices?)\b/i.test(text)
      ||/\b(?:turn|switch|set)\s+(?:bos\s+)?(?:local|cloud)(?:\s+bos|\s+assistance)?\s*(?:to\s+)?(?:on|off|true|false)\b/i.test(text)
      ||/\bbos(?:\s+assistance)?\s+(?:local|cloud)\s+(?:on|off|true|false)\b/i.test(text)));
    state.one_shot=!controls&&requested(prompt,host);state.one_shot_cloud_ready=false;state.turn_id=typeof event.turn_id==='string'&&event.turn_id.length<=256?event.turn_id:null;
    state.control_pending=controls;state.choice_revision=pref.revision;
    if(host==='claude_code'&&/^(?:please\s+)?(?:do not|don't|never)\s+(?:use|connect|start|activate|consult|ask)\s+(?:cloud\s*)?bos\b/i.test(text)) {
      await remove();return contextOutput(event,'BOS consultation is declined in this request. Keep saved choices unchanged and continue ordinary authorized work; do not turn a quoted/negated example into activation or assistance consent.');
    }
    if(controls){
      await save();
      const argv=[process.execPath,fileURLToPath(import.meta.url),'preference','read','--host',host,'--project-root',ctx.root];
      const windows=process.platform==='win32',quote=x=>"'"+x.replaceAll("'",windows?"''":"'\\''")+"'";
      return contextOutput(event,JSON.stringify({purpose:'NATIVE_LOCAL_CONTROL_FIRST',read_argv:argv,
        command_shell:windows?'POWERSHELL':'POSIX',read_command:(windows?'& ':'')+argv.map(quote).join(' ')})
        +'\nThe owner requested an assistance-control change. FIRST run the exact installed local helper read command above. Save the explicitly requested choices locally using the same executable/helper/host/root, preference set --local on|off --cloud on|off --expected-revision <local read revision>, then read back the saved local result. Unqualified Pause BOS/Stop BOS uses preference pause and remembers the actual prior pair; Resume BOS uses preference resume and restores only that pair, never both On by default. Requests naming only Local or Cloud preserve the other saved switch; if unknown, ask only for the missing choice. Do not invent consent or write preferences automatically from hook matching. Cloud bos_assistance_preference READ/SYNC is optional AFTER the supported local save/readback; server unavailability is a separate pending acknowledgment, never a reason to omit or roll back the local save. Never overwrite a newer Cloud choice. Save/read back before guidance. No new install/baseline approval or vendor setting change is required or authorized.');
    }
    if(!enabled&&!state.one_shot){await remove();return controlOnly(event,pref);}
    if(!state.one_shot) {
      const current=sha(prompt.replace(/\s+/g,' ').trim());
      if(state.task_hash!==current){state.failures=0;state.failure_key=null;}
      state.task_hash=current;
    }
    const category=state.one_shot?'OWNER_ONE_SHOT':signal(prompt,state.failures);
    if(!category){await save();return {};}
    return deliver(category,category==='OWNER_ONE_SHOT'?'':sha(prompt.replace(/\s+/g,' ').trim()));
  }
  if(eventName==='PostToolUse'&&state.one_shot&&event.tool_name?.endsWith('__bos_assistance_preference')
    &&event.tool_name.includes('cloudbos')&&event.tool_input?.action==='READ'
    &&event.tool_input.project_ref===ctx.binding.project_ref
    &&(!event.turn_id||!state.turn_id||event.turn_id===state.turn_id)) {
    state.one_shot_cloud_ready=nativeOneShotProjectionMatches(nativeToolResult(event.tool_response),pref,ctx.binding.project_ref);
    await save();return {};
  }
  if(['PostToolUse','PostToolUseFailure'].includes(eventName)&&enabled&&!state.one_shot) {
    const tool=String(event.tool_name??'').replace(/^(?:functions|tools)\./,'');
    if(!/^(Bash|Edit|Write|apply_patch|exec_command)$/.test(tool))return {};
    let response=event.tool_response;
    if(typeof response==='string'&&response.length<65536)try{response=JSON.parse(response);}catch{response=null;}
    const result=response?.structuredContent??response;
    const failed=eventName==='PostToolUseFailure'||result?.is_error===true||Number.isInteger(result?.exit_code)&&result.exit_code!==0;
    if(!failed)return {};
    const input=canonical(event.tool_input??{});
    if(input.length>65536)return {};
    const failureKey=sha(canonical([state.task_hash,tool,sha(input),ctx.evidence_key]));
    if(state.failure_key!==failureKey)state.failures=0;
    state.failure_key=failureKey;
    state.failures=Math.min(3,state.failures+1);await save();
    if(state.failures>=2)return deliver('REPEATED_FAILURE',failureKey);
  }
  return {};
  async function deliver(category,task='') {
    const key=sha(canonical([ctx.evidence_key,pref.revision,category,task]));
    if(category==='REPEATED_FAILURE')state.failures=0;
    if(category!=='OWNER_ONE_SHOT'&&Object.hasOwn(state.signals,key)&&now()-state.signals[key]<300000){await save();return {};}
    if(category!=='OWNER_ONE_SHOT')state.signals=Object.fromEntries([...Object.entries(state.signals).filter(([k])=>k!==key),[key,now()]].slice(-16));await save();
    const local=known&&pref.local_enabled,cloud=known&&pref.cloud_enabled;
    const action=cloud?JSON.stringify({purpose:'RELEVANT_CLOUD_GUIDANCE_NEXT_ACTION',
      skill:nativeSkill(host),
      first_read_only_call:{tool:'bos_connect',arguments:{host,project_ref:ctx.binding.project_ref}},
      then_discover:{tool:'bos_capabilities',arguments:{host,project_ref:ctx.binding.project_ref}}}):null;
    if(host==='claude_code'&&cloud)return contextOutput(event,[`Cloud BOS native assistance: ${category}; exact project ${ctx.binding.project_ref}; saved Local=${String(local)}, Cloud=true.`,action,
      'Saved Cloud On is the owner\'s standing request for relevant read-only BOS consultation; no new BOS wording or consent is needed in this ordinary prompt. Judge the actual task and accepted baseline; a keyword alone or purely cosmetic edit is not relevant. For relevant planning/continuity/repair, invoke the named native Skill and follow its connect, live-schema discovery and actual-guidance workflow before giving BOS-informed advice. Preserve scope and decisions; consultation grants no implementation authority. Report unavailable guidance separately and continue ordinary authorized work.'].join('\n'));
    if(host==='claude_code'&&state.one_shot)return contextOutput(event,JSON.stringify({purpose:'CLAUDE_BOS_EXPLICIT_ENTRY',skill:nativeSkill(host),project_ref:ctx.binding.project_ref})
      +'\nThis is an explicit connection/activation/once request only. Use the native Skill entry, retain the saved choices, and follow the shared exact-project preference READ and supported one-shot protection before any Cloud guidance. Start/connect does not resume ongoing assistance or select On. No optional host recorder or backlog replay; ordinary work/security continue.');
    return contextOutput(event,[`Cloud BOS native assistance: ${category}; exact project ${ctx.binding.project_ref}; saved Local=${known?String(local):'UNKNOWN'}, Cloud=${known?String(cloud):'UNKNOWN'}.`,
      cloud||state.one_shot?'This category is a relevance candidate, not proof of consequence or intent. Judge the actual task first; quoted examples and purely cosmetic label edits do not justify Cloud retrieval. When relevant, use installed public guide and existing native authenticated MCP for this exact binding and actual applicable guidance. Offer one useful suggestion/evidence/next step, then continue authorized work; no catalogue dump or extra approval loop.':'Cloud is Off: no automatic Cloud calls. Use relevant installed local rules and actual task evidence for a proportionate suggestion; keyword hits alone are not consequence and missing optional helpers do not block work.',
      local?'Keep local advice proportionate to the real consequence.':'Discretionary local BOS gates stay passive; actual app security/permissions remain in force.',
      ...(action?[action,'After judging this task genuinely relevant, load the named installed Skill through the current host interface (or read its exact installed path), then make the exact read-only bos_connect call above before answering the relevant plan/advice. Use the current native MCP tools/schema, not direct RPC or credentials. Then call bos_capabilities with locally classified intent_categories from its live schema; follow guidance_activation to retrieve actual applicable tool guidance, review blocking rules and apply it. For BUILD_CHANGE, including read-only architecture/ownership review, use the required bos_project_spec_check with actual baseline evidence and the current schema. Connection/catalogue or a generic answer alone is not guidance use. Read-only planning/advice can consult guidance even when implementing an option would expand accepted scope; that grants no implementation authority. Preserve accepted scope/decisions and clearly label any conditional alternatives. Missing guidance limits dependent BOS-informed claims, not ordinary authorized work. No Cloud retrieval for a task judged purely cosmetic.']:[]),
      state.one_shot?'This is the requested one-shot only: do not resume continuous help or invoke the optional host behavioral recorder. Before paused/unknown Cloud guidance, use existing authenticated bos_assistance_preference READ for this exact project and verify current enrolled service protection, not merely schema availability. Sync only an actually saved choice with CAS; never overwrite a newer Cloud choice or invent saved consent. Both-Off or enrolled NO_SAVED_CHOICE suppresses new service capture/backlog. Local-On/Cloud-Off retains its existing saved capture policy; one-shot does not turn it off or on. Use bos_owner_requested:true only if advertised by the live schema, or an existing supported metadata envelope. Missing enrollment, protection, matching projection or wire support stops only dependent Cloud calls; continue requested local/ordinary work. Never turn Cloud On or use a token relay.':'Before each dependent action recheck saved choices. Do not repeat the same suggestion without new evidence.',
      'Recover accepted local requirements instead of inventing them missing; distinguish missing Cloud receipt from missing content. Local readback is not authenticated service evidence, native compliance or action permission.'
    ].join('\n'));
  }
}

async function main() {
  const args=process.argv.slice(2),at=k=>args[args.indexOf(k)+1];
  const host=at('--host'),project_root=at('--project-root');
  if(args[0]!=='preference'||!['read','set','pause','resume'].includes(args[1]))fail('USAGE_PREFERENCE_READ_SET_PAUSE_RESUME');
  let value;
  if(args[1]==='read')value=await readNativeAssistance({project_root,host});
  else if(['pause','resume'].includes(args[1]))value=await setNativeAssistance({project_root,host,operation:args[1],expected_revision:Number(at('--expected-revision'))});
  else {
    const choice=k=>{const v=at(k);if(!['on','off'].includes(v))fail('EXPLICIT_LOCAL_CLOUD_CHOICES_REQUIRED');return v==='on';};
    value=await setNativeAssistance({project_root,host,local_enabled:choice('--local'),cloud_enabled:choice('--cloud'),expected_revision:Number(at('--expected-revision'))});
  }
  process.stdout.write(JSON.stringify(value)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{process.stderr.write((/^[A-Z_]+$/.test(e.code??'')?e.code:'NATIVE_ASSISTANCE_FAILED')+'\n');process.exitCode=1;});

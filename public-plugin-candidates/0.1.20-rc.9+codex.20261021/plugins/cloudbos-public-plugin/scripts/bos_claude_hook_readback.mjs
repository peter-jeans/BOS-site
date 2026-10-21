#!/usr/bin/env node
// Native startup observation, not a Codex-style trust hash or full lifecycle test.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {inspect} from './bos_hook_ownership.mjs';

async function run(binary,args,options={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{...options,stdio:['ignore','pipe','pipe'],shell:false});
    let output='',size=0;const timer=setTimeout(()=>{child.kill();reject(Error('CLAUDE_READBACK_TIMEOUT'));},30000);
    const collect=x=>{size+=x.length;if(size>1024*1024){child.kill();reject(Error('CLAUDE_READBACK_TOO_LARGE'));}};
    child.stdout.on('data',x=>{collect(x);output+=x;});child.stderr.on('data',collect);
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error('CLAUDE_READBACK_FAILED'));});
  });
}
export async function collectClaudeReadback(root,{binary='claude',mode='installed',cwd}={}) {
  if(!['installed','qualification'].includes(mode))throw Error('INVALID_READBACK_MODE');
  if(!cwd)throw Error('EXACT_PROBE_PROJECT_REQUIRED');
  const project=await fs.realpath(cwd),own=await inspect(root,'claude_code');
  const config=JSON.parse(await fs.readFile(path.join(own.root,'hooks/hooks.json'),'utf8'));
  // Every advertised event must use the same inspected router. No extra commands.
  const purposes=Object.keys(config.hooks??{});
  if(JSON.stringify([...purposes].sort())!==JSON.stringify([...own.purposes].sort()))throw Error('HOOK_PURPOSE_MISMATCH');
  for(const groups of Object.values(config.hooks)) {
    if(groups.length!==1||groups[0].hooks?.length!==1
      ||groups[0].hooks[0].type!=='command'
      ||groups[0].hooks[0].command!=='node "${CLAUDE_PLUGIN_ROOT}/scripts/bos_hook_ownership.mjs" run --host claude_code')throw Error('UNQUALIFIED_HOOK_COMMAND');
  }
  const hostVersion=(await run(binary,['--version'],{cwd:project})).trim();
  const list=async()=>JSON.parse(await run(binary,['plugin','list','--json'],{cwd:project}));
  const before=mode==='installed'?await list():[];
  const matches=[];
  for(const x of before.filter(x=>x.version===own.version&&x.enabled===true&&x.id?.startsWith(own.family+'@'))) {
    // Directory marketplaces may execute the source root rather than installPath.
    // A byte-identical installed package plus the nonce observation binds both.
    if(x.installPath===own.root||(await inspect(x.installPath,'claude_code')).digest===own.digest)matches.push(x);
  }
  if(mode==='installed'&&matches.length!==1)throw Error('EXACT_ENABLED_PLUGIN_REQUIRED');
  if(mode==='installed'&&before.some(x=>x.enabled===true&&x.id?.startsWith(own.family+'@')&&x.id!==matches[0].id))throw Error('CLAUDE_PLUGIN_SELECTION_CONFLICT');
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'bos-claude-hook-probe-')));
  const requestPath=path.join(temp,'request.json'),nonce=randomBytes(32).toString('hex');
  try {
    await fs.chmod(temp,0o700);
    await fs.writeFile(requestPath,JSON.stringify({schema:'BOS_CLAUDE_HOOK_PROBE_V1',nonce,root:own.root,digest:own.digest,project,created_at:new Date().toISOString()}),{mode:0o600});
    const args=['--init-only','--no-session-persistence','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--tools',''];
    // Qualification does not load installed or project customizations and cannot activate an owner.
    // Installed readback uses normal settings so disabled/managed restrictions stay effective.
    if(mode==='qualification')args.push('--setting-sources','','--plugin-dir',own.root);
    await run(binary,args,{cwd:project,env:{...process.env,BOS_CLAUDE_HOOK_PROBE:requestPath}});
    const observed=JSON.parse(await fs.readFile(requestPath+'.observed','utf8').catch(()=>{throw Error('NATIVE_STARTUP_NOT_OBSERVED');}));
    if(observed.nonce!==nonce||observed.root!==own.root||observed.digest!==own.digest||observed.project!==project||observed.event!=='SessionStart')throw Error('NATIVE_STARTUP_NOT_OBSERVED');
    if((await inspect(own.root,'claude_code')).digest!==own.digest)throw Error('PACKAGE_CHANGED_DURING_PROBE');
    if(mode==='installed') {
      const after=await list();
      if(JSON.stringify(after)!==JSON.stringify(before))throw Error('PLUGIN_STATE_CHANGED_DURING_PROBE');
    }
    return {claude_code:{schema:'BOS_CLAUDE_NATIVE_HOOK_READBACK_V1',collected_at:new Date().toISOString(),mode,
      status:'NATIVE_STARTUP_OBSERVED',host_version:hostVersion,root:own.root,digest:own.digest,version:own.version,
      enabled:mode==='installed',plugin_id:matches[0]?.id??null,purposes,
      observation:'SessionStart router executed; other events are definition readback only',
      interactive_workspace_trust:'NOT_ATTESTED',model_conversation:false,tools_enabled:false,mcp_connections:false}};
  } finally {await fs.rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
  if(!args.includes('--root')||!args.includes('--project'))throw Error('ROOT_AND_PROJECT_REQUIRED');
  console.log(JSON.stringify(await collectClaudeReadback(value('--root'),{cwd:value('--project'),mode:args.includes('--qualification')?'qualification':'installed'})));
}

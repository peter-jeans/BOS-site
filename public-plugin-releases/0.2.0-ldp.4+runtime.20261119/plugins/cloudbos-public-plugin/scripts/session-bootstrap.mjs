#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {nativeAssistanceEvent} from './native-assistance.mjs';
const EVENTS=new Set(['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','Stop','SessionEnd']);
const MAX_INPUT_BYTES=64*1024;
// Compatibility context only; no activation or consent follows from it.
export function sessionBootstrapOutput(event={}) {
  if(!['SessionStart','UserPromptSubmit'].includes(event.hook_event_name))return {};
  return {hookSpecificOutput:{hookEventName:event.hook_event_name,additionalContext:'Cloud BOS Public: PENDING_ROUTE_SELECTION; activation PENDING_CURRENT_READBACK. Preserve private/local bindings. Unknown native choices do not authorize automatic guidance. Use an explicit public request or current exact public binding; installation is not activation.'}};
}
async function main() {
  let size=0;const chunks=[];
  for await(const chunk of process.stdin){size+=chunk.length;if(size>MAX_INPUT_BYTES)throw Error('HOOK_INPUT_TOO_LARGE');chunks.push(chunk);}
  const event=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!EVENTS.has(event.hook_event_name)){process.stdout.write('{}\n');return;}
  const i=process.argv.indexOf('--host'),host=i>=0?process.argv[i+1]:undefined;
  // No transcript, credential, environment secret or network inspection.
  process.stdout.write(JSON.stringify(await nativeAssistanceEvent(event,{host}))+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{
  process.stderr.write('Cloud BOS native context unavailable; ordinary authorized work continues.\n');process.exitCode=1;
});

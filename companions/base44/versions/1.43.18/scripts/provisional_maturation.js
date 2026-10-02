import { MATURATION_POLICY } from './generated_provisional_maturation_policy.js';
export const MATURATION_FACTS = ['binding_current','context_present','source_readback','workflows_implemented','verification_passed','critical_blockers_clear','release_approved','release_receipt'];
export const PROVISIONAL_EVIDENCE_SCHEMA = {type:'object',additionalProperties:false,required:['project_id','evidence_hash','facts'],properties:{project_id:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'},evidence_hash:{type:'string',pattern:'^[a-f0-9]{64}$'},facts:{type:'object',additionalProperties:false,properties:Object.fromEntries(MATURATION_FACTS.map(k=>[k,{type:'boolean'}]))},evidence_basis:{type:'string',enum:['HOST_REPORTED','LOCAL_ARTIFACT_READBACK']}}};
export function assessProvisionalMaturation(evidence, expectedProject) {
  if (!evidence || typeof evidence.project_id!=='string' || !evidence.project_id || evidence.project_id!==expectedProject || !/^[a-f0-9]{64}$/.test(evidence.evidence_hash??'')) throw new Error('PROJECT_BOUND_EVIDENCE_REQUIRED');
  if (Object.keys(evidence).some(k=>!['project_id','evidence_hash','facts','evidence_basis'].includes(k))) throw new Error('UNSUPPORTED_EVIDENCE_FIELD');
  const facts=evidence.facts??{};
  if (!facts || Array.isArray(facts) || typeof facts!=='object' || Object.entries(facts).some(([k,v])=>!MATURATION_FACTS.includes(k)||typeof v!=='boolean')) throw new Error('INVALID_FACTS');
  let phase='unknown',missing=[],met=[];
  for (const row of MATURATION_POLICY.phases) {
    const absent=row.requires.filter(k=>facts[k]!==true);
    if (absent.length){missing=absent;break;}
    phase=row.id;met.push(...row.requires);
  }
  const row=MATURATION_POLICY.phases.find(r=>r.id===phase);
  return {schema:'BOS_PROVISIONAL_MATURATION_V1',policy_version:MATURATION_POLICY.version,project_id:evidence.project_id,evidence_hash:evidence.evidence_hash,assessed_phase:phase,assessment_status:phase!=='unknown'?'PROVISIONAL':'BLOCKED_EVIDENCE',verification_status:facts.verification_passed===true?'VERIFIED':'NOT_VERIFIED',confidence:facts.source_readback===true?'MEDIUM':'LOW',evidence_basis:evidence.evidence_basis??'HOST_REPORTED',satisfied_criteria:met,outstanding_criteria:missing,next_action:row?.next_action??'Refresh exact project binding and inspect current project context.',release_decision_required:phase==='release',release_authorized:false,automatic_business_mutation:false};
}
export function releaseDecisionState(assessment, decisions=[]) {
  const current=decisions.filter(d=>d.evidence_hash===assessment.evidence_hash&&d.project_id===assessment.project_id);
  const beta=current.findLast(d=>d.checkpoint==='BETA');
  const checkpoint=beta?.decision==='APPROVE'?'FINAL':'BETA';
  const last=current.findLast(d=>d.checkpoint===checkpoint);
  if (!['release','operate'].includes(assessment.assessed_phase))return {status:'NOT_READY',checkpoint};
  return {status:({APPROVE:'APPROVED',DEFER:'DEFERRED',REJECT:'REJECTED',REQUEST_CHANGES:'CHANGES_REQUESTED'})[last?.decision]??'DECISION_REQUIRED',checkpoint,revisit_condition:last?.revisit_condition??null,prompt:`${checkpoint} DECISION: BOS recommends reviewing the current evidence and limitations. Approve, request changes, defer or reject.`,decision_id:last?.decision_id??null};
}
// Host adapter contract: callbacks belong to the existing authenticated app state owner.
// No network, source writes or release actions are performed by this module.
export async function persistProvisionalAssessment({evidence,projectId,metadataWriteAuthorized,readState,compareAndSet}) {
  if (metadataWriteAuthorized!==true)throw new Error('METADATA_WRITE_NOT_AUTHORIZED');
  const before=await readState();
  if (before.project_id!==projectId || !before.revision)throw new Error('STATE_OWNER_BINDING_REQUIRED');
  const previous=before.state.provisional_maturation??{};
  const decisions=previous.release_decisions??[];
  const approval=decisions.findLast(d=>d.project_id===projectId && d.evidence_hash===evidence.evidence_hash && d.checkpoint==='FINAL');
  const beta=decisions.findLast(d=>d.project_id===projectId && d.evidence_hash===evidence.evidence_hash && d.checkpoint==='BETA');
  const result=assessProvisionalMaturation({...evidence,facts:{...evidence.facts,release_approved:approval?.decision==='APPROVE' && beta?.decision==='APPROVE'}},projectId);
  if (result.assessed_phase==='unknown')return {...result,persistence_status:'BLOCKED'};
  const ownerDecision=releaseDecisionState(result,decisions);
  if (previous.evidence_hash===result.evidence_hash && previous.assessed_phase===result.assessed_phase && JSON.stringify(previous.owner_decision)===JSON.stringify(ownerDecision))return previous;
  const order=['unknown',...MATURATION_POLICY.phases.map(r=>r.id)];
  const next={...result,release_decisions:decisions,owner_decision:ownerDecision,regression_detected:order.indexOf(previous.assessed_phase)>order.indexOf(result.assessed_phase),history:[...(previous.history??[]),{from:previous.assessed_phase??null,to:result.assessed_phase,evidence_hash:result.evidence_hash}],persistence_status:'APPLIED'};
  const state={...before.state,phase_id:result.assessed_phase,phase_label:result.assessed_phase,provisional_maturation:next};
  await compareAndSet({project_id:projectId,expected_revision:before.revision,state});
  const after=await readState();
  if(after.project_id!==projectId || JSON.stringify(after.state)!==JSON.stringify(state))throw new Error('STATE_READBACK_FAILED');
  return next;
}
export const CONTINUITY_GUIDANCE = Object.freeze({schema:'BOS_CONTINUITY_GUIDANCE_V1',version:'1.0.0',header:'Before substantive governed replies, read current exact project binding, relevant capabilities, source revision and effective provisional DBPP state. Emit versioned BOS and host speakers with compact freshness and verification status.',footer:'End substantive responses with next-task model/reasoning advice; show pending release decisions and waiting install work. Use separate orchestrator/target rows for real handoffs.',refresh_triggers:['NEW_SESSION','RESUME','COMPACTION','PROJECT_SWITCH','SOURCE_CHANGE','VERIFIED_CLOSEOUT'],automatic_provisional_progression:'Apply shared phase predicates to current project-bound evidence and persist through the authorized app state owner. Missing routine owner review does not freeze provisional assessment. Never fabricate verification or release approval.',state_owner:'APP_LOCAL_AUTHORIZED_GOVERNANCE_LEDGER',release_checkpoints:['BETA','FINAL'],host_enforcement:'DECLARE_OBSERVED_HOOK_OR_INSTRUCTION_ONLY',claim_boundary:'Instructions and returned guidance do not prove host execution, persisted state or release approval.'});

export async function persistReleaseDecision({projectId,checkpoint,decision,decisionId,evidenceHash,revisitCondition=null,ownerConfirmed,readState,readCurrentEvidence,compareAndSet}) {
  if (ownerConfirmed!==true || !decisionId || !['BETA','FINAL'].includes(checkpoint) || !['APPROVE','DEFER','REJECT','REQUEST_CHANGES'].includes(decision))throw new Error('EXPLICIT_OWNER_DECISION_REQUIRED');
  if (decision==='DEFER' && !revisitCondition)throw new Error('DEFER_REVISIT_CONDITION_REQUIRED');
  const before=await readState();const evidence=await readCurrentEvidence();
  if(!before.revision || before.project_id!==projectId || evidence.project_id!==projectId || evidence.evidence_hash!==evidenceHash || assessProvisionalMaturation(evidence,projectId).assessed_phase!=='release')throw new Error('RELEASE_EVIDENCE_NOT_CURRENT');
  const state=structuredClone(before.state);const m=state.provisional_maturation;
  if (!m || m.evidence_hash!==evidenceHash)throw new Error('STATE_EVIDENCE_MISMATCH');
  const decisions=m.release_decisions??[];
  if(checkpoint==='FINAL' && decisions.findLast(d=>d.project_id===projectId && d.evidence_hash===evidenceHash && d.checkpoint==='BETA')?.decision!=='APPROVE')throw new Error('BETA_DECISION_REQUIRED_FIRST');
  const row={decision_id:decisionId,project_id:projectId,checkpoint,decision,evidence_hash:evidenceHash,revisit_condition:revisitCondition,source:'EXPLICIT_OWNER_DECISION'};
  const existing=decisions.find(d=>d.decision_id===decisionId);
  if(existing && JSON.stringify(existing)!==JSON.stringify(row))throw new Error('DECISION_ID_CONFLICT');
  if(!existing)decisions.push(row);
  m.release_decisions=decisions;m.owner_decision=releaseDecisionState(m,decisions);
  await compareAndSet({project_id:projectId,expected_revision:before.revision,state});
  const after=await readState();
  if(after.project_id!==projectId || JSON.stringify(after.state)!==JSON.stringify(state))throw new Error('DECISION_READBACK_FAILED');
  return row;
}

export function provisionalNextRoute(assessment) {
  const routes={unknown:['verify.foundation','bos_connect'],foundations:['reconcile.project_context','bos_project_spec_check'],build:['continue.bounded_implementation','bos_capabilities'],stabilise:['verify.implementation','bos_health_snapshot'],release:['request.owner_release_decision','bos_health_snapshot'],operate:['monitor.project_health','bos_health_snapshot']};
  const [action_id,tool]=routes[assessment.assessed_phase]??routes.unknown;
  return {action_id,tool,reason:assessment.next_action,permission_effect:'NONE'};
}

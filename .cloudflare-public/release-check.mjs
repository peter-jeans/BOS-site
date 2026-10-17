import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const r=JSON.parse(readFileSync(fileURLToPath(new URL('./release-readiness.json',import.meta.url))));
if(r.publication_allowed!==true||r.policy_status!=='MATCHED_VERIFIED'||!(/^[a-f0-9]{64}$/).test(r.policy_sha256||'')||r.distribution.status!=='APPROVED_IMMUTABLE'||r.control_files.status!=='MATCHED_VERIFIED'||r.native_qualification!=='QUALIFIED'||r.marketplace?.status!=='PUBLISHED_VERIFIED'){console.error('PUBLICATION_HELD: policy, package, controls, native qualification, marketplace publication or owner release approval is unresolved');process.exit(1);}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {verifyHosting, verifyGitHubMain} from './hosting-check.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(resolve(root,name));
const exists = name => existsSync(resolve(root,name));
const approvalPath = '.cloudflare-public/hosting-migration.json';
function changedApproval(change) {
  const record = JSON.parse(read(approvalPath)); change(record);
  return name => name === approvalPath ? JSON.stringify(record) : read(name);
}
test('hosting approval passes without granting product release or native installation', () => {
  assert.deepEqual(verifyHosting(read,exists), {status:'PASS',scope:'HOSTING_ONLY',native_installation:'HELD',product_release:'NOT_APPROVED'});
});
for (const [label, change] of [
 ['missing hosting approval', a => a.hosting_approved=false],
 ['product approval conflation', a => a.product_release_approved=true],
 ['Pages retirement', a => a.preserve_github_pages=false],
 ['wrong Worker', a => a.target_worker='admin-bos'],
 ['wrong domain', a => a.target_domain='admin.cloudbos.dev'],
 ['wrong GitHub source', a => a.source_repository='https://github.com/example/wrong.git'],
 ['missing pin', a => delete a.pinned_files['.cloudflare-public/release-readiness.json']],
 ['invented pin', a => a.pinned_files['private.json']='0'.repeat(64)],
]) test(label+' is rejected', () => assert.throws(() => verifyHosting(changedApproval(change),exists)));
for (const name of ['.cloudflare-public/release-readiness.json','data/host-compatibility.json','.cloudflare-public/assets-manifest.json','.cloudflare-public/marketplace-source-manifest.json','.cloudflare-public/asset-routing.txt','.cloudflare-public/wrangler.production.json']) {
 test('modified '+name+' is rejected', () => assert.throws(() => verifyHosting(n => n===name ? Buffer.concat([read(n),Buffer.from(' ')]) : read(n),exists)));
}
test('Pages configuration change needs review', () => assert.throws(() => verifyHosting(read,n => n==='CNAME' || exists(n))));
const head='a'.repeat(40);
const gitAnswers = {'remote get-url origin':'https://github.com/peter-jeans/BOS-site.git','rev-parse HEAD':head,'status --porcelain --untracked-files=all':'','ls-remote origin refs/heads/main':head+'\trefs/heads/main'};
const fakeGit = overrides => args => ({...gitAnswers,...overrides})[args.join(' ')];
test('clean exact GitHub main is accepted (synthetic Git responses)', () => assert.equal(verifyGitHubMain(fakeGit({})).commit,head));
for (const auth of ['synthetic-user@', 'synthetic-user:synthetic-password@']) {
 test('exact HTTPS destination accepts provider userinfo without retaining it: '+auth.split(':')[0], () => {
  const result=verifyGitHubMain(fakeGit({'remote get-url origin':'https://'+auth+'github.com/peter-jeans/BOS-site.git'}));
  assert.deepEqual(result,{repository:'peter-jeans/BOS-site',branch:'main',commit:head});
 });
}
for (const origin of [
 'https://github.com@other.example/peter-jeans/BOS-site.git',
 'https://other.example@github.com/example/wrong.git',
 'http://github.com/peter-jeans/BOS-site.git',
 'https://github.com:444/peter-jeans/BOS-site.git',
 'https://github.com/peter-jeans/BOS-site.git?other=1',
 'https://github.com/peter-jeans/BOS-site.git#other',
 'git@github.com:peter-jeans/BOS-site.git',
]) test('noncanonical destination stays rejected: '+origin, () => {
 let error;
 try {verifyGitHubMain(fakeGit({'remote get-url origin':origin}));} catch (caught) {error=caught;}
 assert(error); assert.match(error.message,/Wrong source repository/);
 assert(!error.message.includes(origin));
});
for (const [label, overrides] of [
 ['wrong origin',{'remote get-url origin':'https://github.com/example/wrong.git'}],
 ['dirty worktree',{'status --porcelain --untracked-files=all':' M setup.html'}],
 ['untracked file',{'status --porcelain --untracked-files=all':'?? private.json'}],
 ['stale main',{'ls-remote origin refs/heads/main':'b'.repeat(40)+'\trefs/heads/main'}],
 ['unavailable main',{'ls-remote origin refs/heads/main':''}],
]) test(label+' prevents publication', () => assert.throws(() => verifyGitHubMain(fakeGit(overrides))));
test('default product release remains held', () => {
 const result=spawnSync(process.execPath,['.cloudflare-public/release-check.mjs'],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,1); assert.match(result.stderr,/PUBLICATION_HELD/);
});
test('unknown hosting mode is rejected', () => {
 const result=spawnSync(process.execPath,['.cloudflare-public/hosting-check.mjs','--skip-holds'],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,1); assert.match(result.stderr,/Unknown hosting-check argument/);
});

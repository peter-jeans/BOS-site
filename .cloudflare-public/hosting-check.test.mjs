import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
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
  assert.deepEqual(verifyHosting(read,exists), {status:'PASS',scope:'HOSTING_ONLY',native_installation:'NOT_QUALIFIED',preview_downloads:'OWNER_AUTHORIZED',product_release:'NOT_APPROVED'});
});
for (const [label, change] of [
 ['missing preview download approval', r => delete r.launcher_candidate.download_approval],
 ['different preview archive', r => r.launcher_candidate.download_approval.archive_path='downloads/other.zip'],
 ['changed preview checksum', r => r.launcher_candidate.download_approval.archive_sha256='0'.repeat(64)],
 ['additional preview platform', r => r.launcher_candidate.download_approval.platforms.push('linux')],
 ['preview claimed as qualified', r => r.native_qualification='QUALIFIED'],
]) test(label+' is rejected even with a refreshed metadata pin', () => {
 const releasePath='.cloudflare-public/release-readiness.json';
 const release=JSON.parse(read(releasePath));change(release);const bytes=JSON.stringify(release);
 const approval=JSON.parse(read(approvalPath));approval.pinned_files[releasePath]=createHash('sha256').update(bytes).digest('hex');
 assert.throws(() => verifyHosting(n => n===releasePath ? bytes : n===approvalPath ? JSON.stringify(approval) : read(n),exists));
});
test('changed downloadable archive is rejected', () => {
 const p=JSON.parse(read('.cloudflare-public/release-readiness.json')).launcher_candidate.archive_path;
 assert.throws(() => verifyHosting(n => n===p ? Buffer.concat([read(n),Buffer.from('changed')]) : read(n),exists));
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
for (const name of ['.cloudflare-public/release-readiness.json','data/host-compatibility.json','.cloudflare-public/assets-manifest.json','.cloudflare-public/marketplace-source-manifest.json','.cloudflare-public/hosting-input-isolation.json','.cloudflare-public/asset-routing.txt','.cloudflare-public/wrangler.production.json']) {
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

function isolatedHosting(t) {
 const directory=mkdtempSync(resolve(tmpdir(),'bos-hosting-test-'));
 t.after(() => rmSync(directory,{recursive:true,force:true}));
 const write=(name,bytes)=>{const p=resolve(directory,name);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,bytes);};
 const entry=value=>({bytes:Buffer.byteLength(value),sha256:createHash('sha256').update(value).digest('hex')});
 const setup='setup.html', candidate='downloads/cloudbos-setup/candidate.zip', packageFile='public-plugin-releases/candidate/plugin.json';
 const current={ 'index.html':'new home', [setup]:'candidate setup', [candidate]:'candidate zip', [packageFile]:'candidate plugin' };
 for (const [path,bytes] of Object.entries(current)) write(path,bytes);
 write('.cloudflare-public/approved-assets/'+setup,'existing live setup');
 write('.cloudflare-public/build.mjs',read('.cloudflare-public/build.mjs'));
 write('.cloudflare-public/asset-routing.txt','/ /index.html 200\n');
 const manifest=(name,schema,files)=>write('.cloudflare-public/'+name,JSON.stringify({schema,files}));
 manifest('assets-manifest.json','BOS_PUBLIC_STATIC_ASSET_MANIFEST_V1',{'index.html':entry(current['index.html']),[setup]:entry('existing live setup')});
 manifest('marketplace-source-manifest.json','BOS_PUBLIC_MARKETPLACE_SOURCE_MANIFEST_V1',{[packageFile]:entry(current[packageFile])});
 manifest('hosting-input-isolation.json','BOS_PUBLIC_HOSTING_INPUT_ISOLATION_V1',{[setup]:entry(current[setup]),[candidate]:entry(current[candidate])});
 const run=(...args)=>spawnSync(process.execPath,['.cloudflare-public/build.mjs',...args],{cwd:directory,encoding:'utf8'});
 return { directory, write, run, candidate, packageFile, setup };
}
test('hosting emits approved bytes at original routes and excludes every candidate input',t=>{
 const f=isolatedHosting(t), r=f.run();
 assert.equal(r.status,0,r.stderr);
 const dist=resolve(f.directory,'.cloudflare-public/dist');
 assert.equal(readFileSync(resolve(dist,'index.html'),'utf8'),'new home');
 assert.equal(readFileSync(resolve(dist,f.setup),'utf8'),'existing live setup');
 assert(!existsSync(resolve(dist,f.candidate)));
 assert(!existsSync(resolve(dist,f.packageFile)));
});
for (const [label, change, message] of [
 ['unreviewed public file', f=>f.write('downloads/cloudbos-setup/unreviewed.zip','unreviewed'),/Unreviewed or missing public input/],
 ['changed isolated file', f=>f.write(f.candidate,'different ZIP'),/Input (size mismatch|mismatch)/],
 ['changed approved copy', f=>f.write('.cloudflare-public/approved-assets/setup.html','candidate'),/Input size mismatch/],
 ['extra approved copy', f=>f.write('.cloudflare-public/approved-assets/extra.html','candidate'),/Unreviewed or missing preserved live copy/],
 ['symlinked approved copy', f=>{const p=resolve(f.directory,'.cloudflare-public/approved-assets/setup.html');rmSync(p);symlinkSync(resolve(f.directory,'setup.html'),p);},/Symlink rejected/],
]) test(label+' blocks hosting',t=>{
 const f=isolatedHosting(t);
 change(f);
 const r=f.run('--check');
 assert.equal(r.status,1,r.stdout);
 assert.match(r.stderr,message);
});

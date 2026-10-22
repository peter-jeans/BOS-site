import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const hash = value => createHash('sha256').update(value).digest('hex');
export function verifyHosting(read, exists) {
  const json = name => JSON.parse(read(name));
  const approval = json('.cloudflare-public/hosting-migration.json');
  assert.equal(approval.schema, 'BOS_HOSTING_ONLY_APPROVAL_V1');
  assert.equal(approval.scope, 'HOSTING_MIGRATION_ONLY');
  assert.equal(approval.hosting_approved, true);
  assert.equal(approval.product_release_approved, false);
  assert.equal(approval.preserve_github_pages, true);
  assert.equal(approval.source_repository, 'https://github.com/peter-jeans/BOS-site.git');
  assert.equal(approval.source_branch, 'main');
  assert.equal(approval.target_worker, 'bos-public-site');
  assert.equal(approval.target_domain, 'cloudbos.dev');
  const requiredPins = ['release-readiness.json', 'marketplace-source-manifest.json', 'assets-manifest.json', 'asset-routing.txt', 'build.mjs', 'release-check.mjs', 'wrangler.json', 'wrangler.production.json', 'package.json', 'package-lock.json'].map(n => '.cloudflare-public/' + n).concat(['data/host-compatibility.json', '.nojekyll']);
  assert.deepEqual(Object.keys(approval.pinned_files).sort(), requiredPins.sort());
  for (const [name, expected] of Object.entries(approval.pinned_files)) {
    assert.match(expected, /^[a-f0-9]{64}$/);
    assert.equal(hash(read(name)), expected, `Hosting pin changed: ${name}`);
  }
  assert.deepEqual(approval.preserved_absent_paths, ['CNAME', '.github']);
  for (const name of approval.preserved_absent_paths) assert(!exists(name), `Pages baseline changed: ${name}`);
  const release = json('.cloudflare-public/release-readiness.json');
  assert.equal(release.publication_allowed, false);
  assert.equal(release.native_qualification, 'PENDING');
  assert.equal(release.installation_controls, '16_DISABLED_2_PREVIEW_DOWNLOAD_LINKS');
  const launcher = release.launcher_candidate;
  assert.equal(launcher.download_controls, 'OWNER_AUTHORIZED_PREVIEW_DOWNLOADS');
  assert.deepEqual(launcher.download_approval, {
    schema:'BOS_OWNER_PREVIEW_DOWNLOAD_APPROVAL_V1', scope:'EXISTING_PREVIEW_ARCHIVE_ONLY',
    owner_request_date:'2026-10-22',
    archive_path:'downloads/cloudbos-setup/0.1.0/0.1.19+codex.20261019/cloudbos-setup.zip',
    archive_sha256:'db5c7894ab4a148e2ac74b85991e5dfb62510dd4a243f44383753372c1e8ee5d',
    platforms:['macos','windows'], product_release_approved:false, native_qualification:'PENDING'
  });
  assert.equal(launcher.archive_path, launcher.download_approval.archive_path);
  assert.equal(launcher.archive_sha256, launcher.download_approval.archive_sha256);
  assert.equal(hash(read(launcher.archive_path)), launcher.archive_sha256, 'Preview download archive changed');
  const compatibility = json('data/host-compatibility.json');
  assert.equal(compatibility.package_version, '0.1.19+codex.20261019');
  assert.equal(compatibility.grants_installation_approval, false);
  assert.equal(compatibility.publication.install_controls, 'HELD_PENDING_NATIVE_QUALIFICATION');
  assert.equal(compatibility.launcher_candidate.download_controls, launcher.download_controls);
  assert.deepEqual(compatibility.launcher_candidate.download_approval, launcher.download_approval);
  const config = json('.cloudflare-public/wrangler.production.json');
  assert.equal(config.name, approval.target_worker);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, [{pattern: approval.target_domain, custom_domain: true}]);
  assert.deepEqual(config.assets, {directory:'./dist', html_handling:'none', not_found_handling:'404-page'});
  return {status:'PASS', scope:'HOSTING_ONLY', native_installation:'NOT_QUALIFIED', preview_downloads:'OWNER_AUTHORIZED', product_release:'NOT_APPROVED'};
}
export function verifyGitHubMain(git) {
  // Cloudflare clones with ephemeral HTTPS userinfo. Check the exact destination
  // without logging, returning or persisting that authentication material.
  let source;
  try { source = new URL(git(['remote','get-url','origin'])); } catch {}
  assert(source && source.protocol === 'https:' && source.host === 'github.com'
    && source.pathname === '/peter-jeans/BOS-site.git' && source.search === ''
    && source.hash === '', 'Wrong source repository');
  const head = git(['rev-parse','HEAD']);
  assert.match(head, /^[a-f0-9]{40}$/);
  assert.equal(git(['status','--porcelain','--untracked-files=all']), '', 'Publish from a clean checkout only');
  const remote = git(['ls-remote','origin','refs/heads/main']);
  assert.equal(remote, `${head}\trefs/heads/main`, 'HEAD must equal fresh GitHub main');
  return {repository:'peter-jeans/BOS-site', branch:'main', commit:head};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    assert(args.length === 0 || (args.length === 1 && args[0] === '--require-github-main'), 'Unknown hosting-check argument');
    const result = verifyHosting(name => readFileSync(resolve(root,name)), name => existsSync(resolve(root,name)));
    if (args.length) result.source = verifyGitHubMain(args => execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim());
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`HOSTING_HELD: ${error.message}`);
    process.exitCode = 1;
  }
}

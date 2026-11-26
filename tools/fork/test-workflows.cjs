const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const root = path.resolve(__dirname, '../..');
const workflow = name => YAML.parse(fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'));
for (const name of ['release-on-version-bump.yml', 'android-build.yml', 'ios-build.yml']) {
  const document = workflow(name);
  const job = Object.values(document.jobs)[0];
  assert.equal(job.if, "github.repository == 'yuzicapp/yuzic'", `${name} must not ship the fork to stores`);
}
const fork = workflow('fork-apk-release.yml');
assert.deepEqual(fork.on.push.tags, ['*-lv.*']);
assert.equal(fork.jobs.apk.if, "github.repository == 'LuigiVessella/yuzic'");
const commands = fork.jobs.apk.steps.map(step => step.run || '').join('\n');
assert.match(commands, /merge-base --is-ancestor HEAD origin\/master/);
assert.match(commands, /GITHUB_REF_NAME -ne \$version/);
assert.match(commands, /build-apk\.ps1 -Channel Release/);
assert.match(commands, /--draft/);
assert.doesNotMatch(commands, /--clobber|fastlane|supply\(|upload_to/);
assert.equal(fork.permissions.contents, 'read');
const checks = workflow('pr-checks.yml');
assert.ok(checks.on.push.branches.includes('develop'));
assert.ok(checks.on.pull_request.branches.includes('develop'));
assert.ok(fs.statSync(path.join(root, 'AGENTS.md')).size < 30 * 1024, 'Keep room for global instructions in the default Codex guidance limit');
console.log('PASS: workflow isolation, tag/master checks, draft-only publishing and AGENTS size');

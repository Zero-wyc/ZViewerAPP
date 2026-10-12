const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const baseline = require('./native-core-baseline.json');
function verifySources(source, expected = baseline) {
  const files = {};
  const names = ['go.mod', 'go.sum', 'UPSTREAM-LICENSE'];
  for (const dir of ['core', 'mobile']) for (const name of fs.readdirSync(path.join(source, dir))) if (name.endsWith('.go') && !name.endsWith('_test.go')) names.push(`${dir}/${name}`);
  if (JSON.stringify(names.sort()) !== JSON.stringify(Object.keys(expected.files).sort())) throw new Error('Native source inventory differs from the reviewed baseline.');
  for (const relative of names) {
    const data = Buffer.from(fs.readFileSync(path.join(source, relative), 'utf8').replace(/\r\n/g, '\n'));
    if (crypto.createHash('sha256').update(data).digest('hex') !== expected.files[relative]) throw new Error(`Native source differs from the reviewed baseline: ${relative}`);
    files[relative] = data;
  }
  return files;
}
module.exports = { verifySources };
if (require.main === module) {
  const root = path.resolve(__dirname, '..'); const source = path.resolve(root, '../native/bilicore'); const target = path.join(root, '.native-staging/bilicore');
  // The SHA and independent file manifest both remain mandatory. Source updates require review.
  const commit = execFileSync('git', ['rev-parse', `${baseline.referenceCommit}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  if (commit !== baseline.referenceCommit) throw new Error('Reviewed native reference is unavailable.');
  const files = verifySources(source);
  for (const [relative, data] of Object.entries(files)) {
    const original = execFileSync('git', ['show', `${commit}:native/bilicore/${relative}`], { cwd: root, encoding: 'utf8' }).replace(/\r\n/g, '\n');
    if (!data.equals(Buffer.from(original))) throw new Error(`Reference provenance mismatch: ${relative}`);
  }
  if (!process.argv.includes('--verify-only')) {
    fs.mkdirSync(target, { recursive: true });
    for (const [relative, data] of Object.entries(files)) { const output = path.join(target, relative); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, data); }
    for (const dir of ['core', 'mobile']) for (const name of fs.readdirSync(path.join(target, dir))) if (name.endsWith('.go') && !files[`${dir}/${name}`]) fs.unlinkSync(path.join(target, dir, name));
    fs.writeFileSync(path.join(target, 'source-manifest.json'), JSON.stringify(baseline.files, null, 2));
    fs.writeFileSync(path.join(target, 'source-provenance.json'), JSON.stringify({ ...baseline, verifiedAt: new Date().toISOString() }, null, 2));
  }
  console.log(`Verified ${Object.keys(files).length} shared Go source files at ${commit}.`);
}

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../native/bilicore');
const target = path.join(root, '.native-staging/bilicore');
fs.mkdirSync(target, { recursive: true });
const manifest = {};
const reference = 'client-v1.5.0';
const referenceCommit = execFileSync('git', ['rev-parse', `${reference}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
if (referenceCommit !== '1ca96fd46963ff5cb89beb6c3d31e1d7b9f501fc') throw new Error('The fixed client 1.5.0 reference has moved.');
const staged = new Set();
const readVerified = relative => {
  const expected = execFileSync('git', ['show', `${reference}:native/bilicore/${relative}`], { cwd: root }).toString('utf8').replace(/\r\n/g, '\n');
  const data = fs.readFileSync(path.join(source, relative), 'utf8').replace(/\r\n/g, '\n');
  if (data !== expected) throw new Error(`Shared Go differs from the fixed client 1.5.0 reference: ${relative}`);
  staged.add(relative); return Buffer.from(data);
};
for (const dir of ['core', 'mobile']) {
  fs.mkdirSync(path.join(target, dir), { recursive: true });
  for (const name of fs.readdirSync(path.join(source, dir))) {
    if (!name.endsWith('.go') || name.endsWith('_test.go')) continue;
    const relative = `${dir}/${name}`;
    const data = readVerified(relative);
    fs.writeFileSync(path.join(target, relative), data);
    manifest[relative] = crypto.createHash('sha256').update(data).digest('hex');
  }
}
for (const name of ['go.mod', 'go.sum', 'UPSTREAM-LICENSE']) {
  const data = readVerified(name); fs.writeFileSync(path.join(target, name), data);
  manifest[name] = crypto.createHash('sha256').update(data).digest('hex');
}
fs.writeFileSync(path.join(target, 'source-manifest.json'), JSON.stringify(manifest, null, 2));
// Remove obsolete generated files so a previous staging run cannot inject code.
for (const dir of ['core', 'mobile']) for (const name of fs.readdirSync(path.join(target, dir))) if (name.endsWith('.go') && !staged.has(`${dir}/${name}`)) fs.unlinkSync(path.join(target, dir, name));
fs.writeFileSync(path.join(target, 'source-provenance.json'), JSON.stringify({ reference, referenceCommit, normalizedLineEndings: 'LF', files: manifest }, null, 2));
console.log(`Staged ${Object.keys(manifest).length} unchanged shared Go source files for the iOS build.`);

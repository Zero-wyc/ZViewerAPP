const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../native/bilicore');
const target = path.join(root, '.native-staging/bilicore');
fs.mkdirSync(target, { recursive: true });
const manifest = {};
for (const dir of ['core', 'mobile']) {
  fs.mkdirSync(path.join(target, dir), { recursive: true });
  for (const name of fs.readdirSync(path.join(source, dir))) {
    if (!name.endsWith('.go') || name.endsWith('_test.go')) continue;
    const relative = `${dir}/${name}`;
    const data = fs.readFileSync(path.join(source, relative));
    fs.writeFileSync(path.join(target, relative), data);
    manifest[relative] = crypto.createHash('sha256').update(data).digest('hex');
  }
}
for (const name of ['go.mod', 'go.sum', 'UPSTREAM-LICENSE']) {
  const data = fs.readFileSync(path.join(source, name)); fs.writeFileSync(path.join(target, name), data);
  manifest[name] = crypto.createHash('sha256').update(data).digest('hex');
}
fs.writeFileSync(path.join(target, 'source-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Staged ${Object.keys(manifest).length} unchanged shared Go source files for the iOS build.`);

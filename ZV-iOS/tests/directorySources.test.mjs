import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { addDirectoryFiles, browseDirectory, directoryParent, directoryBreadcrumbs, directoryManualPath, listDirectoryRoots } from '../src/lib/directorySources.ts';
const { AbortController } = createRequire(import.meta.url)('abort-controller');
for (const kind of ['webdav', 'ftp', 'openlist', 'server-files']) test(`${kind} roots, browse and partial batch retry retain real mount and file identity`, async () => {
  const calls = []; const writes = []; let fail = true;
  const request = async path => {
    calls.push(path); const url = new URL(path, 'https://fixture.invalid');
    if (url.pathname.endsWith('/roots')) return { roots: [{ key: 'custom:3', name: '测试空间' }, { key: 'uploads', name: '不可用', exists: false }] };
    if (url.pathname.endsWith('/mounts')) return { mounts: [{ id: 7, name: '测试挂载', path: '/', serverUrl: 'https://mount.invalid' }] };
    if (url.pathname.endsWith('/browse')) return { currentPath: url.searchParams.get('path'), entries: [] };
    if (url.searchParams.get('path').endsWith('second.mkv') && fail) throw new Error('temporary resolve failure');
    return { title: url.searchParams.get('path'), videoUrl: '/api/' + kind + '/proxy?path=' + encodeURIComponent(url.searchParams.get('path')), format: 'mkv' };
  };
  const [root] = await listDirectoryRoots(request, kind); await browseDirectory(request, kind, root, root.path);
  const entries = [{ name: '第一部', path: root.path + 'first & 中文.mkv', type: 'file' }, { name: '第二部', path: root.path + 'second.mkv', type: 'file' }];
  const result = await addDirectoryFiles(request, kind, root, entries, async value => writes.push(value), new AbortController().signal);
  assert.deepEqual(result.added, [entries[0].path]); assert.equal(result.failures[0].path, entries[1].path); assert.equal(writes[0].source, kind); assert.equal(writes[0].path, entries[0].path);
  if (kind !== 'server-files') { assert.equal(writes[0].serverUrl, root.serverUrl); assert.equal(writes[0].directLink, false); assert(calls.filter(path => path.includes('/resolve')).every(path => new URL(path, 'https://fixture.invalid').searchParams.get('mountId') === '7')); }
  else { assert.equal(root.path, 'custom:3:/'); assert(calls.filter(path => path.includes('/resolve')).every(path => !path.includes('mountId'))); }
  fail = false; await addDirectoryFiles(request, kind, root, entries.filter(entry => !result.added.includes(entry.path)), async value => writes.push(value)); assert.equal(writes.length, 2);
  const rejected = await addDirectoryFiles(request, kind, root, [{ name: '目录', path: root.path + 'folder', type: 'directory' }], async () => assert.fail('directory must not be added')); assert.equal(rejected.failures.length, 1);
});
test('directory parent stays in selected root and preserves custom root prefixes', () => {
  assert.equal(directoryParent('custom:3:/movies/season', 'custom:3:/'), 'custom:3:/movies'); assert.equal(directoryParent('custom:3:/movies', 'custom:3:/'), 'custom:3:/'); assert.equal(directoryParent('custom:3:/', 'custom:3:/'), null);
  assert.equal(directoryParent('/media/season', '/media'), '/media'); assert.equal(directoryParent('/media', '/media'), null); assert.equal(directoryParent('/media-other/season', '/media'), null); assert.equal(directoryParent('/folder', '/'), '/');
});
test('manual server file input binds relative paths to selected space; explicit prefixes survive', () => {
  assert.equal(directoryManualPath('/movie.mkv', 'server-files', { path: 'custom:3:/' }), 'custom:3:/movie.mkv'); assert.equal(directoryManualPath('uploads:/movie.mkv', 'server-files', { path: 'custom:3:/' }), 'uploads:/movie.mkv'); assert.equal(directoryManualPath('/movie.mkv', 'ftp', { path: '/' }), '/movie.mkv');
});
test('RN cancellation during file resolution prevents any add mutation', async () => {
  const controller = new AbortController(); let writes = 0;
  const result = await addDirectoryFiles(async () => { controller.abort(); return { videoUrl: '/api/ftp/proxy' }; }, 'ftp', { id: 4, path: '/' }, [{ name: '影片', path: '/movie.mkv', type: 'file' }], async () => { writes++; }, controller.signal);
  assert.deepEqual(result, { added: [], failures: [], cancelled: true }); assert.equal(writes, 0);
});

for (const kind of ['webdav', 'openlist']) test(`${kind} inherits the saved mount's direct mode and never silently replaces a failed direct URL with a proxy`, async () => {
  const calls = [], writes = []; let fail = false;
  const request = async path => {
    calls.push(path);
    if (path.endsWith('/mounts')) return { mounts: [{ id: 7, name: 'fixture', directLink: true }] };
    if (path.includes('/direct-url?')) { if (fail) throw new Error('direct denied'); return { directUrl: 'https://cdn.invalid/selected.mkv' }; }
    return { videoUrl: `/api/${kind}/proxy`, format: 'mkv' };
  };
  const [root] = await listDirectoryRoots(request, kind);
  assert.equal(root.directLink, true);
  const entry = { name: 'fixture', path: '/selected.mkv', type: 'file' };
  const result = await addDirectoryFiles(request, kind, root, [entry], async value => writes.push(value));
  assert.deepEqual(result.added, [entry.path]); assert.equal(writes[0].url, 'https://cdn.invalid/selected.mkv'); assert.equal(writes[0].directLink, true); assert.equal(writes[0].sourceMountId, 7);
  assert(calls.some(path => path.includes('/direct-url?mountId=7') || path.includes('&mountId=7')));
  fail = true; const rejected = await addDirectoryFiles(request, kind, root, [entry], async value => writes.push(value));
  assert.equal(rejected.added.length, 0); assert.equal(rejected.failures[0].message, 'direct denied'); assert.equal(writes.length, 1);
});


test('directory breadcrumbs retain the complete selected-root prefix and each exact ancestor path', () => {
  assert.deepEqual(directoryBreadcrumbs('custom:3:/电影/第二季', 'custom:3:/'), [
    { label: 'custom:3:/', path: 'custom:3:/' }, { label: '电影', path: 'custom:3:/电影' }, { label: '第二季', path: 'custom:3:/电影/第二季' },
  ]);
  assert.deepEqual(directoryBreadcrumbs('/media/电影/第二季', '/media'), [
    { label: '/media', path: '/media' }, { label: '电影', path: '/media/电影' }, { label: '第二季', path: '/media/电影/第二季' },
  ]);
  assert.deepEqual(directoryBreadcrumbs('/', '/'), [{ label: '/', path: '/' }]);
  assert.deepEqual(directoryBreadcrumbs('/different/电影', '/media'), [{ label: '/different/电影', path: '/different/电影' }]);
});

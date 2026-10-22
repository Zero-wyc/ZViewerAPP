import { nativeBridge } from './nativeBridge';
import { readPreference, writePreference } from './preferences';
import { normalizeServerUrl } from './server';
import { bindConnectionTransport, clearConnectionTransport } from './connectionTransport';

const POLICY_KEY = 'zviewer-server-connection-policies';
type Policies = Record<string, true>;
let policies: Promise<Policies> | undefined;
let writes: Promise<void> = Promise.resolve();
function loadPolicies(): Promise<Policies> {
  return policies ??= readPreference<{ origins: Policies }>(POLICY_KEY, { origins: {} }).then(value => {
    const result: Policies = {};
    if (!value.origins || typeof value.origins !== 'object' || Array.isArray(value.origins)) return result;
    for (const [origin, enabled] of Object.entries(value.origins).slice(-64)) {
      try { if (enabled === true && origin.startsWith('https:') && new URL(origin).origin === origin) result[origin] = true; } catch {}
    }
    return result;
  });
}

export async function readServerPolicy(raw: string): Promise<boolean> {
  try { const url = new URL(normalizeServerUrl(raw)); return url.protocol === 'https:' && (await loadPolicies())[url.origin] === true; }
  catch { return false; }
}

export function saveServerPolicy(raw: string, allow: boolean): Promise<void> {
  const url = new URL(normalizeServerUrl(raw));
  const operation = writes.catch(() => {}).then(async () => {
    const next = { ...await loadPolicies() };
    delete next[url.origin];
    if (allow && url.protocol === 'https:') next[url.origin] = true;
    while (Object.keys(next).length > 64) delete next[Object.keys(next)[0]];
    await writePreference(POLICY_KEY, { origins: next });
    policies = Promise.resolve(next);
  });
  writes = operation;
  return operation;
}

type Configuration = { url: string; allow: boolean; transport: string };
let configured: Configuration | undefined;
let generation = 0;
let configurations: Promise<void> = Promise.resolve();

// Go replaces its old channel on configure. Serialize changes and reuse the
// exact active configuration so token refresh cannot tear down a playing input.
export function applyServerPolicy(raw: string, allow: boolean): Promise<string> {
  const url = normalizeServerUrl(raw); const enabled = allow && url.startsWith('https:'); const version = ++generation;
  const operation = configurations.catch(() => {}).then(async () => {
    if (version !== generation) throw new Error('服务器选择已取消');
    if (configured?.url === url && configured.allow === enabled) {
      bindConnectionTransport(url, configured.transport);
      return url;
    }
    configured = undefined; clearConnectionTransport();
    if (enabled && !nativeBridge?.configureServerConnection) throw new Error('当前安装包不支持服务器证书例外，请更新原生构建');
    const result = nativeBridge?.configureServerConnection ? await nativeBridge.configureServerConnection(url, enabled) : { url };
    if (version !== generation) throw new Error('服务器选择已取消');
    bindConnectionTransport(url, result.url);
    configured = { url, allow: enabled, transport: result.url };
    return url;
  });
  configurations = operation.then(() => {}, () => {});
  return operation;
}

export async function restoreServerPolicy(server: string): Promise<boolean> {
  const allow = await readServerPolicy(server);
  await applyServerPolicy(server, allow);
  return allow;
}

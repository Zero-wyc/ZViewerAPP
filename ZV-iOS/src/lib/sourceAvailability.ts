import type { ApiRequest } from './mediaLibrary.ts';
import { checkAbort } from './cancellation.ts';

export async function loadSourceAvailability(request: ApiRequest, kinds: readonly string[], signal?: AbortSignal) {
  const [settings, mounted] = await Promise.all([
    request<{ settings: { betaFeaturesEnabled?: boolean } }>('/api/auth/public-settings', { signal }),
    Promise.all(kinds.map(async kind => {
      const data = await request<{ mounts: unknown[] }>(`/api/${kind}/mounts`, { signal });
      return data.mounts.length ? kind : '';
    })),
  ]);
  checkAbort(signal);
  return { beta: settings.settings.betaFeaturesEnabled === true, mounts: mounted.filter(Boolean) };
}

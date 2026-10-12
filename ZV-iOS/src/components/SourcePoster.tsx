import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { fromByteArray } from 'base64-js';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';

// Server credentials stay in one origin-bound fetch. Image only receives data.
export function SourcePoster({ uri, serverProxy = false, proxyPath }: { uri?: string; serverProxy?: boolean; proxyPath?: string }) {
  const { session } = useSession(); const theme = useAppearance();
  const [data, setData] = useState<{ key: string; uri: string } | null>(null);
  const [failed, setFailed] = useState('');
  const key = `${session?.serverUrl}:${session?.user.id}:${uri}:${proxyPath}`;
  useEffect(() => {
    if (!uri || !session || !serverProxy && failed !== key) return;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    const path = serverProxy ? uri : proxyPath || `/api/stream/proxy-image?url=${encodeURIComponent(uri)}`;
    if (!path.startsWith('/api/') || path.startsWith('//')) return () => { controller.abort(); clearTimeout(timer); };
    void fetch(`${session.serverUrl}${path}`, { headers: { Authorization: `Bearer ${session.accessToken}` }, signal: controller.signal, redirect: 'error', credentials: 'omit' }).then(async response => {
      if (!response.ok || !/^image\/(jpeg|png|webp|gif)/i.test(response.headers.get('content-type') || '')) throw new Error('图片不可用');
      if (Number(response.headers.get('content-length')) > 2_000_000) throw new Error('图片过大');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 2_000_000) throw new Error('图片过大');
      if (!controller.signal.aborted) setData({ key, uri: `data:${response.headers.get('content-type')!.split(';')[0]};base64,${fromByteArray(bytes)}` });
    }).catch(() => {}).finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [uri, session, serverProxy, failed, key, proxyPath]);
  const imageUri = data?.key === key ? data.uri : !serverProxy && failed !== key && uri && /^https?:\/\//.test(uri) ? uri : '';
  const style = { width: 66, height: 92, borderRadius: 8 };
  return imageUri ? <Image accessibilityLabel="影片封面" source={{ uri: imageUri }} style={style} resizeMode="cover" onError={() => { setFailed(key); setData(null); }} /> : <View style={[style, { backgroundColor: theme.color('#343d41', 'backgroundColor'), alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: theme.color('#a8b3b6') }}>暂无封面</Text></View>;
}

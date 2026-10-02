import { useState } from 'react';
import { Image, Text, View, type ImageProps } from 'react-native';
import { neteaseImageUrl } from '@/lib/neteaseImage';
import { useAppearance } from '@/state/appearance';
export function MediaImage(props: ImageProps) {
  const theme = useAppearance(); const [failed, setFailed] = useState('');
  const raw = typeof props.source === 'object' && props.source && 'uri' in props.source ? props.source.uri || '' : '';
  const url = raw.startsWith('data:image/') ? raw : neteaseImageUrl(raw);
  if (!url || failed === url) return <View accessibilityLabel="图片不可用" style={[props.style, { backgroundColor: theme.dark ? '#33443a' : '#dce8df', justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: theme.dark ? '#a8b3b6' : '#53655b', fontSize: 22 }}>♫</Text></View>;
  return <Image {...props} source={{ uri: url }} onError={event => { setFailed(url); props.onError?.(event); }} />;
}

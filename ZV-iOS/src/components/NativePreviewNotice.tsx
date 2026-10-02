import Constants from 'expo-constants';
import { Platform, Text } from 'react-native';
import { useAppearance } from '@/state/appearance';
import { Surface } from './Surface';

export function NativePreviewNotice() {
  const theme = useAppearance();
  if (Platform.OS !== 'ios' || !Constants.expoVersion) return null;
  return <Surface readable style={{ padding: 8, borderRadius: theme.preferences.radius }}><Text style={{ color: theme.color('#a8b3b6'), fontSize: 12 }}>Expo Go 界面预览 · 音视频、本机 B站与语音需安装包</Text></Surface>;
}

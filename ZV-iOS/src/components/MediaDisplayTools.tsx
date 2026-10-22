import { Pressable, Switch, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useMediaPreferences } from '@/hooks/useMediaPreferences';
import { useAppearance } from '@/state/appearance';
import { ui as baseUi } from './RoomUi';
import { useMediaPalette } from './MediaPanelUi';

export function MediaDisplayTools({ episodes = false, names = true, compact = false }: { episodes?: boolean; names?: boolean; compact?: boolean }) {
  const preferences = useMediaPreferences(); const theme = useAppearance(); const ui = theme.styles(baseUi); const p = useMediaPalette();
  const toggle = () => preferences.setFullNames(!preferences.fullNames);
  return <View style={[ui.row, { gap: compact ? 4 : 8 }]}>{names ? <Pressable accessibilityRole="switch" accessibilityLabel="完整显示媒体名称" accessibilityState={{ checked: preferences.fullNames }} onAccessibilityTap={toggle} onPress={toggle} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: compact ? 3 : 6 }}><View pointerEvents="none"><Switch accessible={false} value={preferences.fullNames} trackColor={{ false: p.line, true: p.accent }} thumbColor="#fff" style={compact ? { transform: [{ scale: .8 }], marginHorizontal: -5 } : undefined} /></View><Text style={[ui.muted, { fontSize: compact ? 12 : 14 }]}>完整显示</Text></Pressable> : null}
    {episodes ? <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: p.line, borderRadius: 22, padding: 3 }}>{(['list', 'grid'] as const).map(mode => {
      const selected = preferences.episodeMode === mode; const change = () => preferences.setEpisodeMode(mode);
      return <Pressable key={mode} accessibilityRole="button" accessibilityLabel={mode === 'list' ? '列表' : '网格'} accessibilityState={{ selected }} onAccessibilityTap={change} onPress={change} style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 19, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: selected ? p.container : 'transparent' }}><Feather name={mode === 'list' ? 'list' : 'grid'} size={18} color={p.text} /><Text style={[ui.text, { fontWeight: selected ? '600' : '400' }]}>{mode === 'list' ? '列表' : '网格'}</Text></Pressable>;
    })}</View> : null}
  </View>;
}

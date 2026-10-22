import { Pressable, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAppearance } from '@/state/appearance';
import { useMediaPalette } from './MediaPanelUi';
import { ui as baseUi } from './RoomUi';

export function SourceBreadcrumbs({ items, disabled = false }: { items: { id: string; label: string; onPress?: () => void }[]; disabled?: boolean }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const p = useMediaPalette();
  return <View testID="source-breadcrumbs" style={{ flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
    {items.flatMap((item, index) => {
      const label = <Text numberOfLines={1} ellipsizeMode="tail" style={[ui.muted, { minWidth: 0 }]}>{item.label}</Text>;
      const style = { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' as const };
      const current = index === items.length - 1;
      return [index ? <Feather key={`separator-${item.id}`} name="chevron-right" size={18} color={p.muted} /> : null,
        item.onPress ? <Pressable key={item.id} testID={`source-breadcrumb-${item.id}`} accessibilityRole="button" accessibilityLabel={`返回 ${item.label}`} accessibilityState={{ disabled }} disabled={disabled} onPress={item.onPress} onAccessibilityTap={() => { if (!disabled) item.onPress?.(); }} style={style}>{label}</Pressable>
          : <View key={item.id} testID={`source-breadcrumb-${item.id}`} accessibilityLabel={`${current ? '当前目录' : '目录'} ${item.label}`} style={style}>{label}</View>];
    })}
  </View>;
}

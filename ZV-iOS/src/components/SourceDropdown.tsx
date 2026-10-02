import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAppearance } from '@/state/appearance';
import { ui as baseUi } from './RoomUi';

export function SourceDropdown({ label, value, options, onChange, disabled, testID }: {
  label: string; value: string; options: { id: string; name: string }[];
  onChange: (value: string) => void; disabled?: boolean; testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const theme = useAppearance(); const ui = theme.styles(baseUi);
  return <View style={{ gap: 6 }}>
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} aria-expanded={open} accessibilityState={{ expanded: open, disabled }} disabled={disabled}
      onPress={() => setOpen(previous => !previous)} style={[ui.input, ui.row, { justifyContent: 'space-between', opacity: disabled ? 0.45 : 1 }]}>
      <Text style={[ui.text, { flex: 1 }]}>{options.find(item => item.id === value)?.name || '选择数据源'}</Text>
      <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.color('#a8b3b6')} />
    </Pressable>
    {open && !disabled ? <ScrollView testID={testID ? `${testID}-options` : undefined} nestedScrollEnabled keyboardShouldPersistTaps="handled"
      style={[ui.secondary, { maxHeight: 200, flexGrow: 0, borderRadius: 10 }]}>
      {options.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.name} aria-selected={item.id === value} accessibilityState={{ selected: item.id === value }}
        onPress={() => { onChange(item.id); setOpen(false); }} style={{ minHeight: 44, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[ui.text, { flex: 1 }]}>{item.name}</Text>{value === item.id ? <Feather name="check" size={18} color={theme.color('#65d59b')} /> : null}
      </Pressable>)}
    </ScrollView> : null}
  </View>;
}

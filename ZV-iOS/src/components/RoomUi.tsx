import { useAppearance } from '@/state/appearance';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';

export const roomColors = { background: '#111417', surface: '#1b2024', line: '#343d41', text: '#edf1ef', muted: '#a8b3b6', accent: '#65d59b', error: '#ffaaa5' };
export const ui = StyleSheet.create({
  text: { color: roomColors.text, fontSize: 15 }, muted: { color: roomColors.muted, fontSize: 13 },
  title: { color: roomColors.text, fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  card: { backgroundColor: roomColors.surface, padding: 12, borderRadius: 12, gap: 8 },
  content: { gap: 12, paddingBottom: 20 }, error: { color: roomColors.error },
  button: { backgroundColor: roomColors.accent, borderRadius: 10, minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: roomColors.surface, borderWidth: 1, borderColor: roomColors.line },
  buttonText: { color: roomColors.background, fontWeight: '700' }, input: { borderWidth: 1, borderColor: roomColors.line, borderRadius: 10, color: roomColors.text, minHeight: 44, padding: 10, backgroundColor: roomColors.surface },
});
export function RoomButton({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  const theme = useAppearance();
  const localUi = theme.styles(ui);

  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[localUi.button, secondary && localUi.secondary, disabled && { opacity: 0.45 }]}><Text style={[localUi.buttonText, secondary && localUi.text]}>{label}</Text></Pressable>;
}
export function RoomInput(props: TextInputProps) {
  const theme = useAppearance();
  const localUi = theme.styles(ui);
 return <TextInput placeholderTextColor={theme.color(roomColors.muted)} autoCorrect={false} {...props} style={[localUi.input, props.style]} />; }
export function RoomIconButton({ label, icon, onPress }: { label: string; icon: ComponentProps<typeof Feather>['name']; onPress: () => void }) {
  const theme = useAppearance();

  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Feather name={icon} size={22} color={theme.color(roomColors.muted)} /></Pressable>;
}

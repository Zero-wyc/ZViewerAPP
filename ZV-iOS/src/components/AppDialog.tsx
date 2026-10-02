import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/state/appearance';
import { RoomIconButton, ui as baseUi } from './RoomUi';
import { Surface } from './Surface';

export function AppDialog({ visible, title, close, children, maxWidth = 640, closeLabel = '关闭', footer }: { visible: boolean; title: string; close: () => void; children: ReactNode; maxWidth?: number; closeLabel?: string; footer?: ReactNode }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi);
  return <Modal visible={visible} transparent animationType={theme.preferences.reduceMotion ? 'none' : 'fade'} supportedOrientations={['portrait', 'portrait-upside-down', 'landscape']} onRequestClose={close}>
    <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', padding: 16 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}>
      <Surface readable testID={`dialog-${title}`} style={[ui.card, { maxHeight: '92%', width: '100%', maxWidth, alignSelf: 'center', padding: 20 }]}>
        <View style={ui.row}><Text style={[ui.title, { flex: 1 }]}>{title}</Text><RoomIconButton label={closeLabel} icon="x" onPress={close} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, minHeight: 0 }} contentContainerStyle={ui.content}>{children}</ScrollView>
        {footer}
      </Surface>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

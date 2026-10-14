import Feather from '@expo/vector-icons/Feather';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useMediaPalette } from './MediaPanelUi';
import { musicPages, type MusicPage } from './MusicLibrary';
import { RoomButton, RoomIconButton } from './RoomUi';

export type MusicMenu = 'ncm' | 'account' | null;
export function MusicNavigation({ page, onPage, onAccount, menu, setMenu }: { page: MusicPage; onPage: (page: MusicPage) => void; onAccount: () => void; menu: MusicMenu; setMenu: (value: MusicMenu) => void }) {
  const p = useMediaPalette(); const { width, height } = useWindowDimensions(); const compact = width > height && height < 500;
  const navigate = (value: MusicPage) => { setMenu(null); onPage(value); };
  const ncmColor = page === 'bilibili' ? p.muted : p.text;
  const menuStyle = { backgroundColor: p.surface, borderColor: p.line, shadowColor: '#000' };
  const menuHeight = Math.max(96, height / 2 - 26);
  return <View style={[styles.top, compact && { padding: 6 }]}>
    <RoomIconButton label="搜索" icon="search" onPress={() => navigate('search')} />
    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: width < 500 ? 12 : 26 }}>
      <View testID="ncm-menu-anchor" style={{ position: 'relative', zIndex: 31 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="网易云音乐" accessibilityState={{ expanded: menu === 'ncm' }} onPress={() => setMenu(menu === 'ncm' ? null : 'ncm')} style={{ minHeight: compact ? 36 : 48, justifyContent: 'center' }}>
          <View testID="ncm-brand-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text testID="ncm-brand-label" style={{ color: ncmColor, fontSize: width < 500 ? 16 : 20, lineHeight: width < 500 ? 20 : 24, fontWeight: '600' }}>网易云音乐</Text><Feather testID="ncm-brand-chevron" name={menu === 'ncm' ? 'chevron-up' : 'chevron-down'} size={width < 500 ? 16 : 20} color={ncmColor} /></View>
          <View style={{ position: 'absolute', bottom: compact ? 0 : 4, width: 14, height: 2, backgroundColor: page === 'bilibili' ? 'transparent' : p.text, alignSelf: 'center' }} />
        </Pressable>
        {menu === 'ncm' ? <View testID="ncm-menu" style={[styles.menu, menuStyle, { marginTop: 8, left: 0, width: Math.min(240, width - 96) }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: menuHeight }} contentContainerStyle={{ gap: 4 }}>
          {musicPages.filter(item => item.key !== 'bilibili').map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: page === item.key }} onPress={() => navigate(item.key)} style={[styles.item, { backgroundColor: page === item.key ? p.container : 'transparent' }]}><Text style={{ color: p.text, fontSize: 18 }}>{item.label}</Text></Pressable>)}
          </ScrollView>
        </View> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="哔哩哔哩" onPress={() => navigate('bilibili')} style={{ minHeight: compact ? 36 : 48, justifyContent: 'center' }}><Text testID="bili-brand-label" style={{ color: page === 'bilibili' ? p.text : p.muted, fontSize: width < 500 ? 16 : 20, lineHeight: width < 500 ? 20 : 24, fontWeight: '600' }}>哔哩哔哩</Text></Pressable>
    </View>
    <View style={{ position: 'relative', zIndex: 45 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="账号" accessibilityState={{ expanded: menu === 'account' }} onPress={() => setMenu(menu === 'account' ? null : 'account')} style={styles.account}><Feather name="user" size={22} color={p.muted} /></Pressable>
      {menu === 'account' ? <View testID="music-account-menu" style={[styles.menu, menuStyle, { right: 0, width: Math.min(250, width - 56) }]}><ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: menuHeight }} contentContainerStyle={{ gap: 4 }}><Text style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>网易云账号</Text><RoomButton label="账号登录" secondary onPress={() => { setMenu(null); onAccount(); }} /><RoomButton label="音乐设置" secondary onPress={() => navigate('settings')} /></ScrollView></View> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  top: { zIndex: 40, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  menu: { position: 'absolute', top: '100%', zIndex: 30, borderWidth: 1, padding: 12, borderRadius: 12, gap: 4, shadowOpacity: .18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  item: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 8 },
  account: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

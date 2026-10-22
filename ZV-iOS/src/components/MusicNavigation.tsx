import Feather from '@expo/vector-icons/Feather';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useMediaPalette } from './MediaPanelUi';
import { musicPages, type MusicPage } from './MusicLibrary';
import { RoomInput } from './RoomUi';
import { MusicIcon, MusicOption } from './MusicUi';

export type MusicMenu = 'ncm' | 'account' | null;
export function MusicNavigation({ page, onPage, onAccount, menu, setMenu, search, onDiscussion, onBiliSearch }: { page: MusicPage; onPage: (page: MusicPage) => void; onAccount: () => void; menu: MusicMenu; setMenu: (value: MusicMenu) => void; onDiscussion?: () => void; onBiliSearch?: (keyword?: string) => void; search?: { value: string; change: (value: string) => void; submit: () => void; busy: boolean } }) {
  const p = useMediaPalette(); const { width, height } = useWindowDimensions(); const compact = width > height && height < 500;
  const navigate = (value: MusicPage) => { setMenu(null); onPage(value); };
  const openSearch = (submit: boolean) => { setMenu(null); if (page === 'bilibili') onBiliSearch?.(submit ? search?.value : undefined); else { navigate('search'); if (submit) search?.submit(); } };
  const ncmColor = page === 'bilibili' ? p.muted : p.text;
  const menuStyle = { backgroundColor: p.surface, borderColor: p.line, shadowColor: '#000' };
  const menuHeight = Math.max(96, height / 2 - 26);
  return <View style={[styles.top, compact && { padding: 6 }]}>
    {width >= 850 && search ? <View testID="music-wide-search" style={{ width: Math.min(270, width * .25), flexDirection: 'row', alignItems: 'center', gap: 4 }}><RoomInput accessibilityLabel={page === 'bilibili' ? '搜索 B站音乐' : '搜索网易云歌曲或歌手'} placeholder={page === 'bilibili' ? '搜索 B站音乐' : '搜索歌曲 / 歌手'} value={search.value} onChangeText={search.change} style={{ flex: 1, minWidth: 0, minHeight: 42, borderRadius: 21, fontSize: 14 }} onSubmitEditing={() => { if (!search.busy && search.value.trim()) { openSearch(true); } }} /><MusicIcon label="搜索" icon="search" onPress={() => { if (!search.busy && search.value.trim()) { openSearch(true); } }} /></View> : <MusicIcon label="搜索" icon="search" outlined onPress={() => openSearch(false)} />}
    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: width < 500 ? 12 : 26 }}>
      <View testID="ncm-menu-anchor" style={{ position: 'relative', zIndex: 31 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="网易云音乐" accessibilityState={{ expanded: menu === 'ncm' }} onPress={() => setMenu(menu === 'ncm' ? null : 'ncm')} style={{ minHeight: compact ? 44 : 48, justifyContent: 'center' }}>
          <View testID="ncm-brand-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text testID="ncm-brand-label" style={{ color: ncmColor, fontSize: width < 500 ? 16 : 20, lineHeight: width < 500 ? 20 : 24, fontWeight: '600' }}>网易云音乐</Text><Feather testID="ncm-brand-chevron" name={menu === 'ncm' ? 'chevron-up' : 'chevron-down'} size={width < 500 ? 16 : 20} color={ncmColor} /></View>
          <View style={{ position: 'absolute', bottom: compact ? 0 : 4, width: 14, height: 2, backgroundColor: page === 'bilibili' ? 'transparent' : p.text, alignSelf: 'center' }} />
        </Pressable>
        {menu === 'ncm' ? <View testID="ncm-menu" style={[styles.menu, menuStyle, { marginTop: 8, left: 0, width: Math.min(240, width - 96) }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: menuHeight }} contentContainerStyle={{ gap: 4 }}>
          {musicPages.filter(item => item.key !== 'bilibili').map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: page === item.key }} onPress={() => navigate(item.key)} style={[styles.item, { backgroundColor: page === item.key ? p.container : 'transparent' }]}><Text style={{ color: p.text, fontSize: 18 }}>{item.label}</Text></Pressable>)}
          </ScrollView>
        </View> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="哔哩哔哩" onPress={() => navigate('bilibili')} style={{ minHeight: compact ? 44 : 48, justifyContent: 'center' }}><Text testID="bili-brand-label" style={{ color: page === 'bilibili' ? p.text : p.muted, fontSize: width < 500 ? 16 : 20, lineHeight: width < 500 ? 20 : 24, fontWeight: '600' }}>哔哩哔哩</Text><View style={{ position: 'absolute', bottom: compact ? 0 : 4, width: 14, height: 2, backgroundColor: page === 'bilibili' ? p.text : 'transparent', alignSelf: 'center' }} /></Pressable>
    </View>
    <View style={{ position: 'relative', zIndex: 45 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="账号" accessibilityState={{ expanded: menu === 'account' }} onPress={() => setMenu(menu === 'account' ? null : 'account')} style={[styles.account, { borderColor: p.line }]}><Feather name="user" size={22} color={p.text} /></Pressable>
      {menu === 'account' ? <View testID="music-account-menu" style={[styles.menu, menuStyle, { right: 0, width: Math.min(230, width - 56), padding: 4 }]}><ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: menuHeight }}><MusicOption label="账号登录" onPress={() => { setMenu(null); onAccount(); }} /><MusicOption label="音乐设置" onPress={() => navigate('settings')} />{onDiscussion ? <MusicOption label="房间评论" onPress={() => { setMenu(null); onDiscussion(); }} /> : null}</ScrollView></View> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  top: { zIndex: 40, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  menu: { position: 'absolute', top: '100%', zIndex: 30, borderWidth: .5, padding: 10, borderRadius: 14, gap: 4, shadowOpacity: .1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  item: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 8 },
  account: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

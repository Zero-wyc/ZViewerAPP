import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useMusicColors } from './MusicUi';

type Icon = ComponentProps<typeof Feather>['name'];
export type PlayMode = 'sequence' | 'order' | 'repeat-one' | 'shuffle';

const qualityOptions: { value: string; label: string; desc: string }[] = [
  { value: 'lossless', label: '无损优先', desc: 'FLAC 无损' },
  { value: 'exhigh', label: '极高', desc: '320 kbps' },
  { value: 'higher', label: '较高', desc: '192 kbps' },
  { value: 'standard', label: '标准', desc: '128 kbps' },
];
const playModeOptions: { value: PlayMode; label: string; desc: string; icon: Icon }[] = [
  { value: 'sequence', label: '顺序循环', desc: '列表播完从头开始', icon: 'repeat' },
  { value: 'order', label: '按顺序播放', desc: '列表播完后停止', icon: 'list' },
  { value: 'repeat-one', label: '单曲循环', desc: '重复当前歌曲', icon: 'rotate-cw' },
  { value: 'shuffle', label: '随机播放', desc: '随机顺序循环', icon: 'shuffle' },
];

function Card({ icon, title, note, children }: { icon: Icon; title: string; note?: string; children: ReactNode }) {
  const p = useMusicColors();
  return <View style={{ gap: 14, padding: 16, borderRadius: 16, backgroundColor: p.soft, borderWidth: .5, borderColor: p.line }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: p.container, alignItems: 'center', justifyContent: 'center' }}><Feather name={icon} size={17} color={p.accent} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: p.text, fontSize: 16, lineHeight: 22, fontWeight: '600' }}>{title}</Text>
        {note ? <Text style={{ color: p.muted, fontSize: 12, lineHeight: 17 }}>{note}</Text> : null}
      </View>
    </View>
    {children}
  </View>;
}

function Tile({ label, desc, icon, selected, disabled, onPress, basis }: { label: string; desc: string; icon?: Icon; selected: boolean; disabled?: boolean; onPress: () => void; basis: `${number}%` }) {
  const p = useMusicColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: !!disabled }} disabled={disabled} onPress={onPress} style={{ flexBasis: basis, flexGrow: 1, minHeight: 64, padding: 12, gap: 4, borderRadius: 12, borderWidth: 1, borderColor: selected ? p.accent : p.line, backgroundColor: selected ? p.container : 'transparent', opacity: disabled && !selected ? .45 : 1 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon ? <Feather name={icon} size={15} color={selected ? p.accent : p.muted} /> : null}
      <Text numberOfLines={1} style={{ flex: 1, color: selected ? p.accent : p.text, fontSize: 15, lineHeight: 20, fontWeight: selected ? '700' : '500' }}>{label}</Text>
      {selected ? <Feather name="check" size={15} color={p.accent} /> : null}
    </View>
    <Text numberOfLines={1} style={{ color: p.muted, fontSize: 12, lineHeight: 16 }}>{desc}</Text>
  </Pressable>;
}

export function MusicSettings({ quality, setQuality, autoRecommend, changeAutoRecommend, playMode, setPlayMode, retry, host }: {
  quality: string;
  setQuality: (level: string) => void;
  autoRecommend: boolean;
  changeAutoRecommend: (value: boolean) => void;
  playMode: PlayMode;
  setPlayMode: (mode: PlayMode) => void;
  retry: () => void;
  host: boolean;
}) {
  const p = useMusicColors();
  const { width } = useWindowDimensions();
  const basis = width >= 700 ? '22%' : '40%';
  return <View testID="music-settings" style={{ gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
    <View style={{ gap: 4, alignItems: 'center' }}>
      <Text style={{ color: p.text, fontSize: 26, lineHeight: 32, fontWeight: '700' }}>音乐设置</Text>
      <Text style={{ color: p.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>音质为本机偏好，播放模式与续播由房主控制</Text>
    </View>

    <Card icon="disc" title="网易云音质" note="服务器按账号权限自动回退音质">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {qualityOptions.map(option => <Tile key={option.value} basis={basis} label={option.label} desc={option.desc} selected={quality === option.value} onPress={() => { if (quality !== option.value) setQuality(option.value); }} />)}
      </View>
    </Card>

    <Card icon="sliders" title="播放模式" note={host ? undefined : '仅房主可调整'}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {playModeOptions.map(option => <Tile key={option.value} basis={basis} icon={option.icon} label={option.label} desc={option.desc} selected={playMode === option.value} disabled={!host} onPress={() => { if (playMode !== option.value) setPlayMode(option.value); }} />)}
      </View>
    </Card>

    <Card icon="tv" title="B站末尾推荐续播" note="按顺序播放到 B站队列末尾时，房主自动添加相关推荐并续播">
      <Pressable accessibilityRole="switch" accessibilityLabel="B站末尾推荐续播" accessibilityState={{ checked: autoRecommend, disabled: !host }} disabled={!host} onPress={() => changeAutoRecommend(!autoRecommend)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: host ? 1 : .45 }}>
        <Text style={{ flex: 1, color: p.text, fontSize: 15, lineHeight: 20 }}>{autoRecommend ? '已开启' : '已关闭'}{host ? '' : ' · 仅房主可调整'}</Text>
        <View style={{ width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center', backgroundColor: autoRecommend ? p.accent : p.container, borderWidth: autoRecommend ? 0 : .5, borderColor: p.line }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: autoRecommend ? p.onAccent : p.surface, alignSelf: autoRecommend ? 'flex-end' : 'flex-start', shadowColor: '#000', shadowOpacity: .15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }} />
        </View>
      </Pressable>
    </Card>

    <Pressable accessibilityRole="button" accessibilityLabel="重试播放" onPress={retry} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: p.line }}>
      <Feather name="refresh-cw" size={16} color={p.text} />
      <Text style={{ color: p.text, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>重试播放</Text>
    </Pressable>
  </View>;
}

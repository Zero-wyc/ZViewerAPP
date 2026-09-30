import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useSession } from '@/state/session';
import type { VlcPlayer } from '@/lib/vlcPlayer';
import { pickTextFile } from '@/lib/imports';
import { detectFormat, parseSubtitle } from '@/lib/subtitleParser';
import { activeCues, cleanSubtitlePayload, emptySubtitles, subtitleText, type SubtitleState } from '@/lib/subtitleSync';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomInput, ui } from './RoomUi';
export function useSubtitles(roomId: string, player: VlcPlayer, host: boolean, ready: boolean, sourceUrl?: string) {
  const { socket } = useSession(); const [state, setState] = useState(emptySubtitles); const touched = useRef(false);
  const stateRef = useRef(state); useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    touched.current = false; stateRef.current = emptySubtitles;
    let current = true; void Promise.resolve().then(() => { if (current) setState(emptySubtitles); });
    if (host && ready && socket?.connected) socket.emit('subtitle-update', { roomId, ...emptySubtitles });
    return () => { current = false; };
  }, [sourceUrl, host, ready, socket, roomId]);
  useEffect(() => {
    if (!ready || !socket || host) return;
    const receive = (raw: unknown) => { try { const incoming = cleanSubtitlePayload(raw); if (!incoming.tracks.length) touched.current = false; setState(old => touched.current ? { ...old, tracks: incoming.tracks, activeIndex: Math.min(old.activeIndex, incoming.tracks.length - 1) } : incoming); } catch { /* ignore invalid room payloads */ } };
    socket.on('subtitle-update', receive); socket.emit('subtitle-request', { roomId }); return () => { socket.off('subtitle-update', receive); };
  }, [socket, ready, host, roomId]);
  const change = (patch: Partial<SubtitleState>) => {
    const next = cleanSubtitlePayload({ ...stateRef.current, ...patch }); stateRef.current = next; setState(next); touched.current = true;
    if (next.enabled) player.configure({ tracks: { ...player.mediaSettings.tracks, subtitle: -1 } });
    if (host && socket?.connected) socket.emit('subtitle-update', { roomId, ...next });
  };
  return { state, change };
}
export function SubtitleOverlay({ subtitles, player }: { subtitles: ReturnType<typeof useSubtitles>; player: VlcPlayer }) {
  const [time, setTime] = useState(0); useEffect(() => { const subscription = player.addListener('timeUpdate', value => setTime(value.currentTime)); return () => { subscription.remove(); }; }, [player]);
  const { state } = subtitles; const track = state.tracks[state.activeIndex]; if (!state.enabled || !track) return null;
  const cues = activeCues(track.cues, time - state.offset);
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', padding: 16, paddingBottom: 25 }]}>{cues.map((cue, index) => <Text key={index} style={{ color: '#fff', backgroundColor: '#0006', fontSize: state.fontSize, textAlign: cue.align || 'center', textShadowColor: '#000', textShadowOffset: { width: state.strokeWidth, height: state.strokeWidth }, textShadowRadius: state.shadowBlur, maxWidth: '95%', ...(cue.line === undefined ? { transform: [{ translateX: state.shiftX * 3 }, { translateY: state.shiftY * 2 }] } : { position: 'absolute', top: `${cue.line}%`, left: `${Math.max(0, Math.min(90, (cue.position || 50) - 30))}%` }) }}>{subtitleText(cue.text)}</Text>)}</View>;
}
export function SubtitlePanel({ subtitles }: { subtitles: ReturnType<typeof useSubtitles> }) {
  const { state, change } = subtitles; const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [offset, setOffset] = useState('0');
  return <View style={ui.card}><RoomButton label={open ? '收起同步字幕' : '导入 / 同步字幕'} secondary onPress={() => setOpen(value => !value)} />{open ? <><RoomButton label="选择字幕文件（SRT / ASS / VTT / SMI / SUB）" disabled={busy} secondary onPress={() => { setBusy(true); setError(''); void pickTextFile().then(file => { if (!file) return; const cues = parseSubtitle(file.text, detectFormat(file.name, file.text)); if (!cues.length) throw new Error('文件没有可识别的字幕'); const tracks = [...state.tracks, { label: file.name, cues }]; change({ tracks, activeIndex: tracks.length - 1, enabled: true }); }).catch(failure => setError(messageFor(failure))).finally(() => setBusy(false)); }} /><View style={ui.row}><Text style={ui.text}>字幕开关</Text><Switch value={state.enabled} onValueChange={enabled => change({ enabled })} /></View>{state.tracks.map((track, index) => <View key={`${track.label}:${index}`} style={ui.row}><RoomButton label={`${state.activeIndex === index ? '✓ ' : ''}${track.label}`} secondary onPress={() => change({ activeIndex: index, enabled: true })} /><RoomButton label="移除字幕" secondary onPress={() => { const tracks = state.tracks.filter((_, i) => i !== index); change({ tracks, activeIndex: tracks.length ? 0 : -1, enabled: !!tracks.length }); }} /></View>)}<Text style={ui.text}>字号 {state.fontSize}px</Text><Slider minimumValue={10} maximumValue={60} step={1} value={state.fontSize} onSlidingComplete={fontSize => change({ fontSize })} /><RoomInput value={offset} onChangeText={setOffset} keyboardType="numbers-and-punctuation" placeholder="延迟秒数；负数提前" /><RoomButton label="应用字幕偏移" secondary disabled={!Number.isFinite(Number(offset))} onPress={() => change({ offset: Number(offset) })} /><Text style={ui.text}>水平 / 垂直位置</Text>{(['shiftX', 'shiftY'] as const).map(key => <Slider key={key} minimumValue={-50} maximumValue={50} value={state[key]} onSlidingComplete={value => change({ [key]: value })} />)}<Text style={ui.muted}>房主导入同步到其他成员；观众可本地选择。复杂 ASS 效果请用播放器原生外部字幕功能。</Text>{error ? <Text style={ui.error}>{error}</Text> : null}</> : null}</View>;
}

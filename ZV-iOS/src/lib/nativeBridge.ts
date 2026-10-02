import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
type Subscription = { remove(): void };
export type VoiceFrame = { data: string; mediaTs: number };
export type MediaCommand = { sessionId: string; mediaId: string; action: string; value?: number };
export type SystemMediaState = { sessionId: string; mediaId: string; kind: 'video' | 'audio'; title: string; artist?: string; album?: string; cover?: string; host: boolean; uri: string; playing: boolean; position: number; duration: number; playbackRate: number; actions: string[] };
type Bridge = {
  biliCancelResolve(): Promise<void>;
  mediaUpdate(state: string): Promise<void>; mediaClear(sessionId: string): Promise<void>; mediaDrain(sessionId: string): Promise<MediaCommand[]>;
  bili(operation: string, value: string): Promise<Record<string, unknown>>;
  voiceStart(): Promise<void>; voiceStop(): Promise<void>; voiceMute(muted: boolean): Promise<void>;
  voicePlay(peer: string, encoded: boolean, sampleRate: number, clock: number, data: string): Promise<void>;
  voiceDrop(peer: string): Promise<void>;
  addListener(event: 'onVoiceFrame', callback: (frame: VoiceFrame) => void): Subscription;
  addListener(event: 'onVoiceStatus', callback: (event: { message: string }) => void): Subscription;
  addListener(event: 'onMediaCommand', callback: (event: MediaCommand) => void): Subscription;
};
export const nativeBridge = Platform.OS === 'ios' ? requireOptionalNativeModule<Bridge>('ZViewerNative') : null;
export async function biliOperation<T>(operation: string, value = ''): Promise<T> {
  if (!nativeBridge) throw new Error('本机 B站和语音功能需要安装包含原生模块的 iOS 构建');
  const result = await nativeBridge.bili(operation, value);
  if (!result.success) throw new Error(typeof result.message === 'string' ? result.message : '本机 B站操作失败');
  return result as T;
}

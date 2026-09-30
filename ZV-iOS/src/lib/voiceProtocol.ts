export function opusHeader(): Uint8Array {
  const result = new Uint8Array(19); result.set([79, 112, 117, 115, 72, 101, 97, 100, 1, 1]);
  new DataView(result.buffer).setUint32(12, 48000, true); return result;
}
export function voiceBytes(data: unknown): Uint8Array | null {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
  return bytes && bytes.byteLength > 0 && bytes.byteLength <= 23040 ? bytes : null;
}
export function usableVoiceFrame(data: { encoded?: boolean; sampleRate?: number; timestamp?: number }, bytes: Uint8Array, now = Date.now()) {
  if (!Number.isFinite(data.timestamp) || Math.abs(now - data.timestamp!) > 10000) return false;
  if (data.encoded) return bytes.byteLength <= 4000;
  return bytes.byteLength % 4 === 0 && Number.isFinite(data.sampleRate) && data.sampleRate! >= 8000 && data.sampleRate! <= 96000;
}

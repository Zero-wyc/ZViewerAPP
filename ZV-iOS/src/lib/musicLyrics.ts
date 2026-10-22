import { parseLyrics, type TimedText } from './timeline.ts';
export type MusicLyric = TimedText & { roman?: string; translation?: string };
export function musicLyrics(value: { lrc?: { lyric?: string }; romalrc?: { lyric?: string }; tlyric?: { lyric?: string } }): MusicLyric[] {
  const roman = parseLyrics(value.romalrc?.lyric || ''); const translated = parseLyrics(value.tlyric?.lyric || '');
  const nearest = (lines: TimedText[], time: number) => lines.find(line => Math.abs(line.time - time) < .1)?.content;
  return parseLyrics(value.lrc?.lyric || '').map(line => ({ ...line, roman: nearest(roman, line.time), translation: nearest(translated, line.time) }));
}

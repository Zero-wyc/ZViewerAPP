export function retainMusicPlayback(joined: boolean, mode: string, phase: string) {
  return joined && mode === 'listen-together' && ['connecting', 'joining', 'waiting'].includes(phase);
}

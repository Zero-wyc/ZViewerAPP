/** Accept URLs copied alone or inside Bilibili's share text. Keep page parameters. */
export function normalizeBilibiliInput(input: string): string {
  const value = input.trim().replace(/\\([.:/?=&])/g, '$1')
  const link = value.match(/https?:\/\/(?:[a-z0-9-]+\.)*(?:bilibili\.com|b23\.tv|bili2233\.cn)(?=[:/?#\s]|$)[^\s<>"']*/i)
  return link ? link[0].replace(/[，。；！？，、）】》)\]]+$/, '') : value
}

export function isBilibiliShortLink(input: string): boolean {
  try {
    const url = new URL(input)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      ['b23.tv', 'bili2233.cn'].includes(url.hostname.toLowerCase())
  } catch { return false }
}

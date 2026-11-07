/** The mobile client currently ships Chinese UI only. */
export function t(text: string, values: Record<string, unknown> = {}): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ''))
}

/** Native WBI signing contract shared with the Go core's fixed vectors. */
const MIXIN_INDEX: number[] = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13];

export function wbiMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  let mixin = '';
  for (const index of MIXIN_INDEX) if (index < raw.length) mixin += raw[index];
  return mixin.slice(0, 32);
}

function encodeWbi(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character: string) =>
    '%' + character.charCodeAt(0).toString(16).toUpperCase());
}

/** Sorting, UTF-8, %20 spaces and value filtering must match the transmitted query. */
export function wbiQuery(parameters: Map<string, string>): string {
  const keys = Array.from(parameters.keys()).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const value = (parameters.get(key) ?? '').replace(/[!'()*]/g, '');
    if (value !== '') parts.push(`${encodeWbi(key)}=${encodeWbi(value)}`);
  }
  return parts.join('&');
}

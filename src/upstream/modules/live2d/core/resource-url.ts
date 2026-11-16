/** Resolve public files against Vite's deployment base, including packaged `./` builds. */
export function resolveLive2DAssetUrl(
  path: string,
  baseUrl: string,
  moduleUrl: string,
  pageUrl: string
): string {
  const relativePath = path.replace(/^\/+/, '')
  const base = baseUrl === './'
    ? new URL('../', moduleUrl)
    : new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`, pageUrl)
  return new URL(relativePath, base).href
}

/** Resolve server-owned paths from the selected server, then apply native transport routing. */
export function resolveLive2DServerUrl(
  path: string,
  serverUrl: string,
  transport: (url: string) => string = (url) => url
): string {
  const prefix = serverUrl.replace(/\/+$/, '')
  const relativePath = path.replace(/^\/+/, '')
  return transport(new URL(`${prefix}/${relativePath}`).href)
}

/** Custom model URLs may be absolute third-party URLs or root-relative selected-server URLs. */
export function resolveLive2DModelUrl(
  modelUrl: string,
  serverUrl: string,
  transport: (url: string) => string = (url) => url
): string {
  return modelUrl.startsWith('/')
    ? resolveLive2DServerUrl(modelUrl, serverUrl, transport)
    : transport(modelUrl)
}

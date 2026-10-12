export function socketEndpoint(server: string) {
  const url = new URL(server);
  return { origin: url.origin, path: `${url.pathname.replace(/\/+$/, '')}/socket.io` };
}

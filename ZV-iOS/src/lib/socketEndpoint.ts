import { connectionUrl } from './connectionTransport.ts';
export function socketEndpoint(server: string) {
  const url = new URL(connectionUrl(server));
  return { origin: url.origin, path: `${url.pathname.replace(/\/+$/, '')}/socket.io` };
}

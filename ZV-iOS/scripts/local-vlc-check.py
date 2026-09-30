"""Local-only libVLC/unchanged ZViewer range validation; never uses a NAS URL.
Desktop libVLC evidence is explicitly distinct from iOS VLCKit acceptance.
"""
import ctypes as c
import json
import os
import re
import threading
import time
import urllib.request as u
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode

BASE = 'http://127.0.0.1:7333'
OUT = Path(__file__).resolve().parents[3] / 'local-ios-validation' / 'vlc-desktop-results.json'
def api(route, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    request = u.Request(BASE + route, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    with u.urlopen(request, timeout=15) as response: return json.load(response)

login = api('/api/auth/login', {'username': 'root', 'password': 'root'})
TOKEN = login['accessToken']
roots = api('/api/server-files/roots', token=TOKEN)['roots']
root = next((item for item in roots if item['absPath'].replace('\\', '/').lower() == 'c:/users/fredq/videos'), None)
if not root:
    root = api('/api/server-files/roots', {'name': 'Local iOS validation', 'absPath': 'C:/Users/FredQ/Videos', 'readonly': True}, TOKEN)['root']
assert root['readonly']
FILMS = {name: BASE + '/api/server-files/proxy?' + urlencode({'path': root['key'] + ':/' + name, 'token': TOKEN}) for name in ('S01E01.mkv', 'S01E04.mp4')}
# A just-created root may not appear until the existing registry cache expires.
# Check the authenticated endpoint before starting VLC so a fixture/setup error
# cannot be mistaken for a decoder or continuation failure.
for name, url in FILMS.items():
    for attempt in range(70):
        try:
            with u.urlopen(u.Request(url, method='HEAD'), timeout=10) as response:
                assert response.status == 200
                assert int(response.headers['Content-Length']) == (Path('C:/Users/FredQ/Videos') / name).stat().st_size
            break
        except u.HTTPError as error:
            if error.code != 400 or attempt == 69: raise RuntimeError(f'{name}: preflight HTTP {error.code}') from None
            time.sleep(0.5)
records = []
lock = threading.Lock()
started = time.monotonic()

class Relay(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_HEAD(self): self.relay(True)
    def do_GET(self): self.relay(False)
    def relay(self, head):
        name = self.path.lstrip('/').split('?')[0]
        if name not in FILMS: self.send_error(404); return
        headers = {'Range': self.headers['Range']} if self.headers.get('Range') else {}
        entry = {'film': name, 'method': 'HEAD' if head else 'GET', 'range': headers.get('Range'), 'bytes': 0, 'start': round(time.monotonic() - started, 3), 'active': True}
        with lock: records.append(entry)
        try:
            with u.urlopen(u.Request(FILMS[name], method=entry['method'], headers=headers), timeout=20) as response:
                entry.update(status=response.status, contentRange=response.headers.get('Content-Range'), contentLength=response.headers.get('Content-Length'))
                self.send_response(response.status)
                for key in ('Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified'):
                    if response.headers.get(key): self.send_header(key, response.headers[key])
                self.send_header('Connection', 'close'); self.end_headers()
                if not head:
                    while True:
                        data = response.read(32768)
                        if not data: break
                        self.wfile.write(data)
                        with lock: entry['bytes'] += len(data)
        except (BrokenPipeError, ConnectionResetError): entry['cancelled'] = True
        except Exception as error:
            entry['error'] = type(error).__name__
            if isinstance(error, u.HTTPError): entry['status'] = error.code
        finally:
            with lock: entry.update(active=False, end=round(time.monotonic() - started, 3))

relay = ThreadingHTTPServer(('127.0.0.1', 0), Relay)
threading.Thread(target=relay.serve_forever, daemon=True).start()
RELAY = f'http://127.0.0.1:{relay.server_port}'
vlc_dir = Path('C:/Program Files/VideoLAN/VLC')
dll_dir = os.add_dll_directory(str(vlc_dir))
vlc = c.CDLL(str(vlc_dir / 'libvlc.dll'))
def bind(name, restype, *args):
    function = getattr(vlc, name); function.restype = restype; function.argtypes = list(args); return function
new = bind('libvlc_new', c.c_void_p, c.c_int, c.POINTER(c.c_char_p))
media_new = bind('libvlc_media_new_location', c.c_void_p, c.c_void_p, c.c_char_p)
media_option = bind('libvlc_media_add_option', None, c.c_void_p, c.c_char_p)
media_release = bind('libvlc_media_release', None, c.c_void_p)
player_new = bind('libvlc_media_player_new_from_media', c.c_void_p, c.c_void_p)
play = bind('libvlc_media_player_play', c.c_int, c.c_void_p)
pause = bind('libvlc_media_player_set_pause', None, c.c_void_p, c.c_int)
seek = bind('libvlc_media_player_set_time', None, c.c_void_p, c.c_int64)
get_time = bind('libvlc_media_player_get_time', c.c_int64, c.c_void_p)
get_length = bind('libvlc_media_player_get_length', c.c_int64, c.c_void_p)
state = bind('libvlc_media_player_get_state', c.c_int, c.c_void_p)
stop = bind('libvlc_media_player_stop', None, c.c_void_p)
release = bind('libvlc_media_player_release', None, c.c_void_p)
version = bind('libvlc_get_version', c.c_char_p)
instance_release = bind('libvlc_release', None, c.c_void_p)
class Stats(c.Structure):
    _fields_ = [('readBytes', c.c_int), ('inputBitrate', c.c_float), ('demuxBytes', c.c_int), ('demuxBitrate', c.c_float), ('corrupted', c.c_int), ('discontinuities', c.c_int), ('decodedVideo', c.c_int), ('decodedAudio', c.c_int), ('displayed', c.c_int), ('lost', c.c_int), ('playedAudio', c.c_int), ('lostAudio', c.c_int), ('sentPackets', c.c_int), ('sentBytes', c.c_int), ('sendBitrate', c.c_float)]
stats_get = bind('libvlc_media_get_stats', c.c_int, c.c_void_p, c.POINTER(Stats))
arguments = [b'--intf=dummy', b'--vout=dummy', b'--aout=dummy', b'--no-video-title-show', b'--quiet', b'--stats']
argv = (c.c_char_p * len(arguments))(*arguments)
instance = new(len(arguments), argv)
assert instance
players = []
results = {'scope': 'desktop libVLC; NOT iOS VLCKit acceptance', 'libvlc': version().decode(), 'server': 'unmodified local v4.2.0 source', 'serverCap': 8388608, 'films': {}}
for name in FILMS:
    media = media_new(instance, (RELAY + '/' + name).encode())
    media_option(media, b':network-caching=1500')
    player = player_new(media)
    assert play(player) == 0
    players.append((name, media, player))

def snapshot(label):
    values = {}
    for name, media, player in players:
        statistics = Stats(); stats_get(media, c.byref(statistics))
        with lock:
            relevant = [record for record in records if record['film'] == name]
            requests = len(relevant); transferred = sum(record['bytes'] for record in relevant)
        values[name] = {'time': get_time(player)/1000, 'duration': get_length(player)/1000, 'state': state(player), 'decodedVideo': statistics.decodedVideo, 'decodedAudio': statistics.decodedAudio, 'readBytes': statistics.readBytes, 'relayRequests': requests, 'relayBytes': transferred}
    print(json.dumps({'phase': label, 'values': values}), flush=True)
    return values

try:
    for step in range(10):
        time.sleep(60)
        values = snapshot(f'continuous-{(step+1)*60}s')
        for name, value in values.items():
            if value['state'] in (6, 7): raise RuntimeError(f'{name}: ended/error before 10 minutes')
    results['continuous'] = values
    for target in (90, 700, 1300):
        for _, _, player in players: seek(player, target*1000)
        time.sleep(6)
        results.setdefault('seeks', []).append({'target': target, 'values': snapshot('seek')})
    for _, _, player in players: pause(player, 1)
    time.sleep(5); before = snapshot('paused-settled')
    time.sleep(10); after = snapshot('paused-ten-seconds')
    results['pause'] = {'before': before, 'after': after}
    for _, _, player in players: pause(player, 0)
    time.sleep(6); results['resumed'] = snapshot('resumed')
    for _, _, player in players: stop(player)
    time.sleep(2); stopped = snapshot('stopped-settled')
    time.sleep(5); stopped_after = snapshot('stopped-five-seconds')
    results['stop'] = {'before': stopped, 'after': stopped_after}
except Exception as error:
    results['error'] = str(error)
finally:
    for _, media, player in players: stop(player); release(player); media_release(media)
    instance_release(instance)
    relay.shutdown(); relay.server_close()
    with lock: results['requests'] = records.copy()
    results['elapsed'] = round(time.monotonic() - started, 3)
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'finished': True, 'file': str(OUT), 'error': results.get('error')}), flush=True)

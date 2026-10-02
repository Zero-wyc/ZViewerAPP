"""Inspect the reported MKV and exercise local VLC Range/seek/track selection.
Desktop VLC evidence does not substitute for iOS VLCKit 4 device acceptance.
Usage: python scripts/check-ass-media.py <mkv> [output-directory]
"""
import ctypes as c
import json
import os
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

media = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2] if len(sys.argv) > 2 else '.expo/b16-ass-validation').resolve()
output.mkdir(parents=True, exist_ok=True)
probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=index,codec_name,codec_type:stream_tags=language,title', '-of', 'json', str(media)], encoding='utf-8'))
tracks = [s for s in probe['streams'] if s['codec_type'] == 'subtitle']
assert len(tracks) == 2 and all(s['codec_name'] == 'ass' for s in tracks)
assert any(s['codec_type'] == 'attachment' and s['codec_name'] == 'ttf' for s in probe['streams'])
counts = []
for index in range(len(tracks)):
    target = output / f'track-{index}.ass'
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(media), '-map', f'0:s:{index}', '-c', 'copy', '-y', str(target)], check=True)
    text = target.read_text(encoding='utf-8-sig')
    counts.append({'track': index, 'dialogues': len(re.findall(r'^Dialogue:', text, re.M)), 'position_tags': text.count('\\pos('), 'move_tags': text.count('\\move('), 'drawing_tags': len(re.findall(r'\\p[1-9]', text))})
    assert counts[-1]['dialogues'] > 0 and counts[-1]['position_tags'] > 0

ranges = []
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_HEAD(self): self.serve(True)
    def do_GET(self): self.serve(False)
    def serve(self, head):
        size = media.stat().st_size
        match = re.fullmatch(r'bytes=(\d+)-(\d*)', self.headers.get('Range', ''))
        start = int(match[1]) if match else 0
        if start >= size:
            self.send_response(416); self.send_header('Content-Range', f'bytes */{size}'); self.end_headers(); return
        end = min(size - 1, int(match[2]) if match and match[2] else size - 1, start + 8 * 1024 * 1024 - 1) if match else size - 1
        self.send_response(206 if match else 200)
        self.send_header('Content-Type', 'video/x-matroska'); self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(end - start + 1))
        if match: self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers(); ranges.append({'range': self.headers.get('Range'), 'status': 206 if match else 200})
        if head: return
        try:
            with media.open('rb') as source:
                source.seek(start); remaining = end - start + 1
                while remaining:
                    data = source.read(min(65536, remaining))
                    if not data: break
                    self.wfile.write(data); remaining -= len(data)
        except (BrokenPipeError, ConnectionResetError): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
vlc_root = Path(os.environ.get('VLC_ROOT', 'C:/Program Files/VideoLAN/VLC'))
dll_dir = os.add_dll_directory(str(vlc_root)); vlc = c.CDLL(str(vlc_root / 'libvlc.dll'))
def bind(name, result, *args):
    fn = getattr(vlc, name); fn.restype = result; fn.argtypes = args; return fn
new = bind('libvlc_new', c.c_void_p, c.c_int, c.POINTER(c.c_char_p))
create_media = bind('libvlc_media_new_location', c.c_void_p, c.c_void_p, c.c_char_p)
create_player = bind('libvlc_media_player_new_from_media', c.c_void_p, c.c_void_p)
play = bind('libvlc_media_player_play', c.c_int, c.c_void_p)
stop = bind('libvlc_media_player_stop', None, c.c_void_p)
seek = bind('libvlc_media_player_set_time', None, c.c_void_p, c.c_int64)
clock = bind('libvlc_media_player_get_time', c.c_int64, c.c_void_p)
select = bind('libvlc_video_set_spu', c.c_int, c.c_void_p, c.c_int)
selected = bind('libvlc_video_get_spu', c.c_int, c.c_void_p)
class Description(c.Structure): pass
Description._fields_ = [('id', c.c_int), ('name', c.c_char_p), ('next', c.POINTER(Description))]
descriptions = bind('libvlc_video_get_spu_description', c.POINTER(Description), c.c_void_p)
free_descriptions = bind('libvlc_track_description_list_release', None, c.POINTER(Description))
args = [b'--intf=dummy', b'--vout=dummy', b'--aout=dummy', b'--no-video-title-show', b'--quiet', b'--network-caching=300']
instance = new(len(args), (c.c_char_p * len(args))(*args)); source = create_media(instance, f'http://127.0.0.1:{server.server_port}/movie.mkv'.encode()); player = create_player(source)
checks = []
try:
    assert play(player) == 0
    for _ in range(100):
        if clock(player) >= 500: break
        time.sleep(0.1)
    first = descriptions(player); item = first; ids = []
    while item:
        if item.contents.id >= 0: ids.append(item.contents.id)
        item = item.contents.next
    free_descriptions(first); assert len(ids) == 2, ids
    for track in [ids[0], ids[1], -1, ids[0]]:
        assert select(player, track) == 0
        time.sleep(0.3); assert selected(player) == track
        checks.append({'selected_subtitle_id': track})
    duration = float(probe['format']['duration'])
    for seconds in [55, 120, 700, min(1300, int(duration) - 10)]:
        seek(player, seconds * 1000)
        for _ in range(80):
            actual = clock(player) / 1000
            if seconds - 1 <= actual <= seconds + 5: break
            time.sleep(0.1)
        assert seconds - 1 <= actual <= seconds + 5, (seconds, actual)
        checks.append({'seek_seconds': seconds, 'actual_seconds': actual})
finally:
    stop(player); bind('libvlc_media_player_release', None, c.c_void_p)(player)
    bind('libvlc_media_release', None, c.c_void_p)(source); bind('libvlc_release', None, c.c_void_p)(instance)
    server.shutdown(); server.server_close(); dll_dir.close()
report = {'scope': 'reported real MKV, ffprobe/ASS extraction and desktop libVLC 3 over local capped Range; NOT iOS VLCKit 4 rendering validation', 'file': media.name, 'duration': duration, 'subtitle_tracks': tracks, 'font_attachments': sum(s['codec_type'] == 'attachment' for s in probe['streams']), 'ass_content': counts, 'checks': checks, 'http_requests': len(ranges), 'range_requests': sum(r['status'] == 206 for r in ranges)}
(output / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))

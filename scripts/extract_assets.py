#!/usr/bin/env python3
"""Decode Blip & Blop assets using the documented original engine formats.

Requires Python 3, Pillow and numpy. Does not execute the downloaded game.
Run from the repository: python tools/extract_assets.py
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess

import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'vendor/original-source/vc-projects/Blip_n_Blop_3'
EVENT_NAMES = ['enemy', 'enemy_generator', 'animated_background', 'middle_background',
               'foreground', 'scroll_lock', 'hold_fire', 'forced_scroll', 'dialogue',
               'set_flag', 'text', 'sound', 'weather', 'overkill', 'dynamic_load',
               'music', 'bonus_generator', 'turret', 'bonus']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n')


class Reader:
    def __init__(self, data):
        self.data, self.pos = data, 0

    def take(self, n):
        assert n >= 0 and self.pos + n <= len(self.data), (self.pos, n, len(self.data))
        out = self.data[self.pos:self.pos + n]
        self.pos += n
        return out

    def ints(self, n=1):
        return list(struct.unpack('<' + 'i' * n, self.take(4 * n)))

    def int(self):
        return self.ints()[0]

    def string(self, n):
        return self.take(n).split(b'\0', 1)[0].decode('cp1252')

    def done(self):
        assert self.pos == len(self.data), ('trailing data', self.pos, len(self.data))


def lgx(data):
    assert data[:3] == b'LGX'
    version, width, height, depth = struct.unpack_from('<BHHH', data, 3)
    assert version in (0, 1) and depth == 16 and width and height
    words = np.frombuffer(data, dtype='<u2', offset=10)
    if version == 0:
        pixels = words
    else:
        pixels = np.empty(width * height, dtype=np.uint16)
        i = j = 0
        while i < len(words):
            word = int(words[i]); i += 1
            if word & 0x8000:
                count = word & 0x7fff
                pixels[j:j + count] = words[i]
                i += 1; j += count
            else:
                pixels[j] = word; j += 1
        assert j == width * height, (j, width, height)
    assert len(pixels) == width * height
    # Engine tab_0/tab_1 use integer floor conversion, not bit replication.
    rgb = np.empty((height * width, 4), dtype=np.uint8)
    rgb[:, 0] = (((pixels >> (10 if version else 11)) & 31) * 255 // 31)
    rgb[:, 1] = (((pixels >> 5) & (31 if version else 63)) * 255 // (31 if version else 63))
    rgb[:, 2] = ((pixels & 31) * 255 // 31)
    key = (246, 205 if version else 210, 148)
    rgb[:, 3] = np.where(np.all(rgb[:, :3] == key, axis=1), 0, 255)
    return Image.fromarray(rgb.reshape(height, width, 4), 'RGBA'), version


def material_maps(im):
    """Inferred maps, not recovered geometry. Bevel silhouettes + low-pass luma."""
    alpha = im.getchannel('A')
    a = np.asarray(alpha, dtype=np.float32) / 255
    luminance = np.asarray(im.convert('L').filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255
    # Eight inward erosion steps create a stable rounded silhouette even on sprites.
    bevel = np.zeros(a.shape, dtype=np.float32)
    current = alpha
    for _ in range(8):
        current = current.filter(ImageFilter.MinFilter(3))
        bevel += np.asarray(current, dtype=np.float32) / (255 * 8)
    heights = a * (0.18 + 0.58 * bevel + 0.24 * luminance)
    height_im = Image.fromarray(np.uint8(np.clip(heights * 255, 0, 255)), 'L')
    smooth = np.asarray(height_im.filter(ImageFilter.GaussianBlur(0.7)), dtype=np.float32) / 255
    # np.gradient needs at least two pixels in each dimension.
    dy = np.gradient(smooth, axis=0) if im.height > 1 else np.zeros_like(smooth)
    dx = np.gradient(smooth, axis=1) if im.width > 1 else np.zeros_like(smooth)
    normal = np.stack([-dx * 5.0, dy * 5.0, np.ones_like(dx)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    rgba = np.empty((*a.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.uint8(np.clip((normal * .5 + .5) * 255, 0, 255))
    rgba[:, :, 3] = np.asarray(alpha)
    return height_im, Image.fromarray(rgba, 'RGBA')


def save_atlases(out, name, frames, source_info, maps=True):
    """Deterministic shelf packing; preserve IDs, dimensions, and sprite hotspots."""
    target = out / 'graphics' / name
    target.mkdir(parents=True, exist_ok=True)
    width = 2048
    layouts = []
    entries = []
    x = y = rowh = 0
    page = []
    for frame in frames:
        im = frame.pop('_image')
        if x + im.width + 2 > width:
            x = 0; y += rowh; rowh = 0
        if y + im.height + 2 > 2048 and page:
            layouts.append((page, max(1, y + rowh)))
            page = []; x = y = rowh = 0
        assert im.width <= 2048 and im.height <= 2048
        frame.update(page=len(layouts), x=x+1, y=y+1, width=im.width, height=im.height)
        entries.append(frame)
        page.append((frame, im))
        x += im.width + 2
        rowh = max(rowh, im.height + 2)
    if page:
        layouts.append((page, y + rowh))
    pages = []
    for i, (layout, h) in enumerate(layouts):
        # Tight dimensions keep tiny banks compact.
        w = max(f['x'] + f['width'] + 1 for f, _ in layout)
        color = Image.new('RGBA', (w, h))
        depth = Image.new('L', (w, h))
        normals = Image.new('RGBA', (w, h), (128, 128, 255, 0))
        for frame, im in layout:
            spot = (frame['x'], frame['y'])
            color.paste(im, spot)
            if maps:
                hi, ni = material_maps(im)
                depth.paste(hi, spot); normals.paste(ni, spot)
        color.save(target / f'atlas-{i}.png', optimize=False)
        p = {'color': f'atlas-{i}.png', 'width': w, 'height': h}
        if maps:
            depth.save(target / f'height-{i}.png')
            normals.save(target / f'normal-{i}.png')
            p.update(heightMap=f'height-{i}.png', normalMap=f'normal-{i}.png')
        pages.append(p)
    manifest = dict(bank=name, source=source_info, pages=pages, frames=entries,
                    materialMaps={'origin': 'inferred, not original geometry',
                                  'method': 'eight-pixel alpha silhouette bevel plus blurred luminance',
                                  'normalConvention': 'RGB tangent-space XYZ; image y points downward'})
    write_json(target / 'atlas.json', manifest)
    return {'bank': name, 'frames': len(entries), 'pages': len(pages),
            'manifest': f'graphics/{name}/atlas.json'}


def gfx(path, out):
    data = path.read_bytes(); r = Reader(data)
    count = r.int(); frames = []
    for i in range(count):
        hotspot_x, hotspot_y, size = r.ints(3)
        blob = r.take(size)
        im, version = lgx(blob)
        frames.append({'id': i, 'hotspotX': hotspot_x, 'hotspotY': hotspot_y,
                       'lgxVersion': version, 'sourceOffset': r.pos-size,
                       'sourceBytes': size, 'rgbaSha256': digest(im.tobytes()), '_image': im})
    r.done()
    return save_atlases(out, path.stem, frames, {'file': path.name, 'sha256': digest(data)})


def font(path, out):
    data = path.read_bytes(); r = Reader(data)
    height, space = r.ints(2); frames = []
    for char in range(1, 256):
        size = r.int()
        if not size:
            continue
        im, version = lgx(r.take(size))
        frames.append({'id': char, 'character': bytes([char]).decode('cp1252', errors='replace'),
                       'hotspotX': 0, 'hotspotY': 0, 'lgxVersion': version,
                       'rgbaSha256': digest(im.tobytes()), '_image': im})
    r.done()
    return save_atlases(out, 'font-' + path.stem, frames,
                       {'file': path.name, 'sha256': digest(data), 'lineHeight': height, 'spaceWidth': space}, maps=False)


def runs(values):
    """Lossless [x,length,value] encoding, including absent platform value 65535."""
    if not values:
        return []
    result = []; start = 0
    for i in range(1, len(values)+1):
        if i == len(values) or values[i] != values[start]:
            result.append([start, i-start, values[start]])
            start = i
    return result


def level(path, out):
    data = path.read_bytes(); r = Reader(data)
    keys = ['background', 'animation', 'enemies', 'sounds', 'music', 'dialogue', 'portraits']
    resources = {key: r.string(20).lower() for key in keys}
    screen_count = r.int(); width = screen_count * 640
    screens = r.ints(screen_count)
    x1, y1, x2, y2 = r.ints(4)
    vx, vf1, vv1, vf2, vv2 = r.ints(5)
    platforms = [runs(r.ints(width)) for _ in range(8)]
    cols = width // 8
    opaque = [runs(list(r.take(cols))) for _ in range(60)]
    bloody = [runs(list(r.take(cols))) for _ in range(60)]
    count = r.int(); events = []
    for i in range(count):
        offset = r.pos
        vals = r.ints(9)
        tmp = bool(r.take(1)[0]); file = r.string(20); padding = r.take(3)
        kind, activation, ident, x, bank, y, capacity, value, period = vals
        event = {'index': i, 'type': EVENT_NAMES[kind], 'eventId': kind,
                 'activationX': activation, 'id': ident, 'x': x,
                 'bank': bank, 'y': y, 'capacity': capacity, 'value': value,
                 'period': period, 'temporary': tmp, 'file': file,
                 'sourceOffset': offset, 'rawIntegers': vals}
        # Explicit union aliases match fic_events.h and Game::chargeNiveau.
        if kind in (5, 6, 8, 9, 10):
            event.update(condition=y, flag=capacity)
        if kind in (0, 1): event['direction'] = value
        if kind == 7: event['speed'] = y
        if kind == 10: event['textId'] = bank
        if kind == 12: event['intensity'] = y
        if kind == 15: event['play'] = bool(y)
        if kind == 17: event['direction'] = value
        events.append(event)
    # Some distributed levels carry one unused trailing byte. Preserve it explicitly.
    trailing = r.take(len(data) - r.pos)
    assert len(trailing) <= 3, ('unexpected level payload', path.name, len(trailing))
    r.done()
    obj = {'name': path.stem, 'source': {'file': path.name, 'sha256': digest(data), 'trailingHex': trailing.hex()},
           'width': width, 'height': 480, 'screenWidth': 640, 'screenCount': screen_count,
           'resources': resources, 'screens': screens,
           'starts': [{'x': x1, 'y': y1}, {'x': x2, 'y': y2}],
           'victory': {'x': vx, 'flag1': vf1, 'value1': vv1, 'flag2': vf2, 'value2': vv2},
           'platformEncoding': '[startX, length, y]; 65535 means no platform',
           'platforms': platforms, 'collisionCellSize': 8,
           'collisionEncoding': '60 rows of [startColumn, length, value]',
           'opaqueWalls': opaque, 'bloodWalls': bloody, 'events': events}
    write_json(out / 'levels' / f'{path.stem}.json', obj)
    return {'name': path.stem, 'screens': screen_count, 'width': width,
            'events': count, 'eventTypes': dict(collections.Counter(e['type'] for e in events)),
            'file': f'levels/{path.stem}.json'}


def sounds(path, out):
    data = path.read_bytes(); r = Reader(data)
    count = r.int(); entries = []
    target = out / 'audio' / path.stem
    target.mkdir(parents=True, exist_ok=True)
    for i in range(count):
        buffers, size = r.ints(2); wav = r.take(size)
        assert wav[:4] == b'RIFF' and wav[8:12] == b'WAVE'
        file = target / f'{i:03}.wav'; file.write_bytes(wav)
        entries.append({'id': i, 'buffers': buffers, 'file': file.name,
                        'bytes': size, 'sha256': digest(wav)})
    r.done()
    write_json(target / 'bank.json', {'source': path.name, 'sha256': digest(data), 'sounds': entries})
    return {'bank': path.stem, 'sounds': count, 'manifest': f'audio/{path.stem}/bank.json'}


def text_asset(path, out):
    text = path.read_bytes().decode('cp1252')
    target = out / 'scripts' / (path.stem + path.suffix + '.txt')
    target.parent.mkdir(parents=True, exist_ok=True); target.write_text(text)
    if path.suffix == '.dat':
        obj = {line.split('^', 1)[0]: line.split('^', 1)[1] for line in text.splitlines() if '^' in line}
    else:
        obj = [{'line': i, 'command': line.strip()} for i, line in enumerate(text.splitlines(), 1)
               if line.strip() and not line.lstrip().startswith(';')]
    write_json(out / 'scripts' / (path.name + '.json'), obj)
    return {'file': path.name, 'commands': len(obj)}


def music_format(data):
    if data[:4] == b'OggS':
        return 'ogg'
    if data[:4] == b'RIFF' and data[8:12] == b'WAVE':
        return 'wav'
    # Two original MP3s have a zero-filled first 417-byte frame. Preserve those
    # bytes while checking the first nonzero MPEG header, not just its sync bits.
    signature = data.lstrip(b'\0')
    if signature[:3] == b'ID3':
        if len(signature) < 10 or signature[3] not in (2, 3, 4) or any(b & 0x80 for b in signature[6:10]):
            return 'unknown'
        tag_size = sum(b << shift for b, shift in zip(signature[6:10], (21, 14, 7, 0)))
        footer = 10 if signature[3] == 4 and signature[5] & 0x10 else 0
        signature = signature[10 + tag_size + footer:].lstrip(b'\0')
    if len(signature) < 4:
        return 'unknown'
    a, b, c, d = signature[:4]
    if (a == 0xff and b & 0xe0 == 0xe0
            and (b >> 3) & 3 != 1  # Reserved MPEG version.
            and (b >> 1) & 3 == 1  # Layer III, not arbitrary MPEG audio.
            and 0 < c >> 4 < 15   # Valid fixed bitrate index.
            and (c >> 2) & 3 != 3  # Valid sample-rate index.
            and d & 3 != 2):       # Reserved emphasis mode.
        return 'mp3'
    return 'unknown'


def music(path, out):
    data = path.read_bytes()
    format_name = music_format(data)
    extension = '.' + format_name if format_name != 'unknown' else '.bin'
    name = path.stem + ('-mp3' if path.suffix == '.mp3' else '') + extension
    target = out / 'music' / name
    target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
    info = {'source': path.name, 'file': 'music/' + name, 'format': format_name,
            'sha256': digest(data), 'bytes': len(data),
            'leadingZeroBytes': len(data) - len(data.lstrip(b'\0'))}
    # Existing originals are losslessly copied, including historical padding.
    return info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE / 'data')
    parser.add_argument('--output', type=Path, default=ROOT / 'assets-extracted')
    parser.add_argument('--only', choices=['graphics', 'levels', 'audio', 'scripts'])
    args = parser.parse_args()
    out = args.output; out.mkdir(parents=True, exist_ok=True)
    manifest = {'formatVersion': 1,
                'provenance': {'sourceDirectory': str(args.source.relative_to(ROOT)) if args.source.is_relative_to(ROOT) else str(args.source),
                               'decoderReferences': ['picture_bank.cpp', 'lgx_packer.cpp', 'lgx_packer.h', 'sound_bank.cpp',
                                                     'game.cpp:Game::chargeNiveau', 'fic_events.h', 'fonte.cpp']},
                'graphics': [], 'fonts': [], 'levels': [], 'sounds': [], 'music': [], 'scripts': [], 'sourceFiles': []}
    for path in sorted(args.source.iterdir()):
        if not path.is_file(): continue
        blob = path.read_bytes()
        manifest['sourceFiles'].append({'file': path.name, 'bytes': len(blob), 'sha256': digest(blob)})
        ext = path.suffix.lower()
        print(path.name, flush=True)
        if ext == '.gfx' and args.only in (None, 'graphics'):
            manifest['graphics'].append(gfx(path, out))
        elif ext == '.lft' and args.only in (None, 'graphics'):
            manifest['fonts'].append(font(path, out))
        elif ext == '.lvl' and args.only in (None, 'levels'):
            manifest['levels'].append(level(path, out))
        elif ext == '.sfx' and args.only in (None, 'audio'):
            manifest['sounds'].append(sounds(path, out))
        elif ext in ('.zik', '.mp3') and args.only in (None, 'audio'):
            manifest['music'].append(music(path, out))
        elif ext in ('.rpg', '.cin', '.mbk', '.dat', '.lst') and args.only in (None, 'scripts'):
            manifest['scripts'].append(text_asset(path, out))
    manifest['totals'] = {'spriteBanks': len(manifest['graphics']),
                          'sprites': sum(x['frames'] for x in manifest['graphics']),
                          'fonts': len(manifest['fonts']), 'glyphs': sum(x['frames'] for x in manifest['fonts']),
                          'levels': len(manifest['levels']), 'events': sum(x['events'] for x in manifest['levels']),
                          'soundBanks': len(manifest['sounds']), 'sounds': sum(x['sounds'] for x in manifest['sounds']),
                          'music': len(manifest['music']),
                          'musicFormats': dict(collections.Counter(x['format'] for x in manifest['music'])),
                          'scripts': len(manifest['scripts']),
                          'sourceBytes': sum(x['bytes'] for x in manifest['sourceFiles'])}
    write_json(out / ('manifest-' + args.only + '.json' if args.only else 'manifest.json'), manifest)
    print(json.dumps(manifest['totals'], indent=2))


if __name__ == '__main__':
    main()

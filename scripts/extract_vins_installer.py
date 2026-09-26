#!/usr/bin/env python3
"""Extract the exact Vins NSIS 1.x installer without executing Windows code.

Requires the checked-out NSISExtractor legacy bzip2 codec in tools/NSISExtractor.
Its CLI supports later framed archives; this 2002 installer instead uses one solid
bzip2 stream, so this adapter implements the verified 236-byte/24-byte layout.
"""
from pathlib import Path
import argparse
import hashlib
import json
import struct
import sys
import types

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_SHA = '70924896a6f403b4ab53b58d5a4203bfe6e1f54f3132b1ae71921ce454291b2e'
EXPECTED_STREAM_SHA = 'e901020e5fb529a3930a060762d6bd2a9ecc53fde31d66bc515130dab5af4e5e'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reuse-stream', action='store_true', help='Reuse a completed nsis-decompressed.bin')
    args = parser.parse_args()
    source = ROOT / 'downloads/vins-download.html'
    data = source.read_bytes()
    assert sha(data) == EXPECTED_SHA, 'This adapter only accepts the verified Vins installer.'
    out = ROOT / 'vendor/vins-original'
    out.mkdir(parents=True, exist_ok=True)
    stream = out / 'nsis-decompressed.bin'
    nsis_offset = data.index(b'\xef\xbe\xad\xdeNullsoftInst') - 4
    flags, signature, m1, m2, m3, header_size, total = struct.unpack_from('<7I', data, nsis_offset)
    assert nsis_offset == 35840 and header_size == 7511
    if not args.reuse_stream:
        # Import codec alone; pefile is unnecessary because the verified overlay
        # offset is explicit, and no general executable parser is used here.
        pkg = types.ModuleType('nsis_extractor')
        pkg.__path__ = [str(ROOT / 'tools/NSISExtractor/nsis_extractor')]
        sys.modules['nsis_extractor'] = pkg
        from nsis_extractor.codecs.bzip2 import decompress_to_file_with_framing
        with stream.open('wb') as file:
            count, framing = decompress_to_file_with_framing(
                data[nsis_offset + 28:], file, max_output_size=250 * 1024 * 1024)
        print(f'Decoded {count} bytes; framing: {framing}', flush=True)
    unpacked = stream.read_bytes()
    assert sha(unpacked) == EXPECTED_STREAM_SHA, 'Incomplete or corrupted decompressed stream.'
    assert struct.unpack_from('<I', unpacked)[0] == header_size
    header = unpacked[4:4 + header_size]
    entry_count = struct.unpack_from('<I', header, 52)[0]
    section_count = struct.unpack_from('<I', header, 224)[0]
    entry_start = 236 + section_count * 20
    string_start = entry_start + entry_count * 24
    assert (entry_count, section_count, entry_start, string_start) == (145, 3, 296, 3776)
    strings = header[string_start:]

    def string(offset):
        assert 0 <= offset < len(strings)
        return strings[offset:].split(b'\0', 1)[0]

    destination = ''
    manifest = {'installerSha256': EXPECTED_SHA, 'installerBytes': len(data),
                'nsisOffset': nsis_offset, 'headerBytes': header_size,
                'streamSha256': sha(unpacked), 'streamBytes': len(unpacked),
                'entryCount': entry_count, 'sectionCount': section_count,
                'decoder': {'repository': 'https://github.com/KokerZhou/NSISExtractor',
                            'commit': '8644b63d79a35bf002ba75f42375a9e4dafbbe74',
                            'adapter': 'scripts/extract_vins_installer.py'},
                'files': [], 'sourceComparison': []}
    source_data = ROOT / 'vendor/original-source/vc-projects/Blip_n_Blop_3/data'
    base = 4 + header_size
    for index in range(entry_count):
        op, a, b, c, d, e = struct.unpack_from('<6i', header, entry_start + index * 24)
        if op == 13:  # NSIS 1.x SetOutPath / create directory.
            raw = string(a)
            assert raw and raw[0] >= 0xf0, ('Unexpected destination root', raw)
            # Keep any other installer variable symbolic, never resolve host paths.
            prefix = '' if raw[0] == 0xf3 else f'$NSIS_VAR_{raw[0]:02X}/'
            destination = prefix + raw[1:].decode('cp1252').replace('\\', '/').strip('/')
        elif op == 20:  # NSIS 1.x ExtractFile.
            filename = string(b).decode('cp1252')
            relative = Path(destination) / filename
            assert not relative.is_absolute() and '..' not in relative.parts
            offset = base + c
            size = struct.unpack_from('<I', unpacked, offset)[0]
            blob = unpacked[offset + 4:offset + 4 + size]
            assert len(blob) == size, ('Incomplete decompressed stream', filename, size)
            path = out / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(blob)
            entry = {'path': str(relative), 'bytes': size, 'sha256': sha(blob),
                     'nsisEntry': index, 'streamOffset': offset + 4}
            manifest['files'].append(entry)
            counterpart = source_data / filename
            if destination == 'data':
                if counterpart.exists():
                    other = counterpart.read_bytes()
                    manifest['sourceComparison'].append({'file': filename, 'same': sha(other) == sha(blob),
                                                         'installerBytes': size, 'sourceBytes': len(other),
                                                         'installerSha256': sha(blob), 'sourceSha256': sha(other)})
                else:
                    manifest['sourceComparison'].append({'file': filename, 'sourceMissing': True})
    manifest['fileCount'] = len(manifest['files'])
    manifest['unpackedBytes'] = sum(x['bytes'] for x in manifest['files'])
    manifest['sameAsSource'] = sum(x.get('same', False) for x in manifest['sourceComparison'])
    manifest['differentFromSource'] = sum(x.get('same') is False for x in manifest['sourceComparison'])
    (out / 'extraction-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({k: v for k, v in manifest.items() if k not in ('files', 'sourceComparison')}, indent=2))


if __name__ == '__main__':
    main()

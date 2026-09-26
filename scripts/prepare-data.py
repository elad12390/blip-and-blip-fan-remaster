#!/usr/bin/env python3
"""Stage original game data and deterministic gzip companions for browser loading."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import shutil


def compress_resource(data):
    # GzipFile fixes the OS marker across platforms. An empty filename and zero
    # timestamp prevent local paths and build times entering published bytes.
    output = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', compresslevel=9,
                       fileobj=output, mtime=0) as archive:
        archive.write(data)
    return output.getvalue()


root = Path(__file__).resolve().parents[1]
source = root / 'vendor/original-source/vc-projects/Blip_n_Blop_3/data'
target = root / 'web/data'
target.mkdir(parents=True, exist_ok=True)
asset_limit = 25 * 1024 * 1024
files = []
for path in sorted(source.iterdir()):
    if not path.is_file():
        continue
    data = path.read_bytes()
    if len(data) > asset_limit:
        raise ValueError(f'{path.name} exceeds static hosting asset limit')
    compressed_name = f'{path.name}.gz'
    if (source / compressed_name).exists():
        raise ValueError(f'{compressed_name} collides with an original resource')
    compressed = compress_resource(data)
    if len(compressed) > asset_limit:
        raise ValueError(f'{compressed_name} exceeds static hosting asset limit')
    shutil.copy2(path, target / path.name)
    (target / compressed_name).write_bytes(compressed)
    files.append({
        'name': path.name,
        'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
        'compressedName': compressed_name,
        'compressedBytes': len(compressed),
    })
manifest = {
    'version': 1,
    'sourceCommit': '68a3e6e3f85f2f7bb52314ad8f92821d079a5f97',
    'totalBytes': sum(item['bytes'] for item in files),
    'totalCompressedBytes': sum(item['compressedBytes'] for item in files),
    'files': files,
}
(root / 'web/data-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
raw_size = manifest['totalBytes']
compressed_size = manifest['totalCompressedBytes']
saving = 100 * (1 - compressed_size / raw_size) if raw_size else 0
print(f'Staged {len(files)} original resources with gzip companions; '
      f'{raw_size / 1048576:.2f} MiB raw, {compressed_size / 1048576:.2f} MiB gzip '
      f'({saving:.1f}% smaller).')

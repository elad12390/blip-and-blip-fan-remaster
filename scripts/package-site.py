#!/usr/bin/env python3
"""Build and verify a static Sites deployment archive from a clean commit."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

root = Path(__file__).resolve().parents[1]
for args in [['git', 'diff', '--quiet'], ['git', 'diff', '--cached', '--quiet']]:
    subprocess.run(args, cwd=root, check=True)
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
manifest = json.loads((root / 'web/data-manifest.json').read_text())
for item in manifest['files']:
    raw = (root / 'web/data' / item['name']).read_bytes()
    if len(raw) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256']:
        raise SystemExit('Resource verification failed: ' + item['name'])
    if gzip.decompress((root / 'web/data' / item['compressedName']).read_bytes()) != raw:
        raise SystemExit('Compressed resource verification failed: ' + item['name'])
if '_bb_qa_' in (root / 'web/core/blipblop.js').read_text():
    raise SystemExit('Diagnostic engine cannot be published.')
subprocess.run(['npm', 'run', 'build'], cwd=root, check=True)
archive = root / 'artifacts/site.tar.gz'
with tarfile.open(archive, 'w:gz') as output:
    output.add(root / '.openai/hosting.json', arcname='.openai/hosting.json')
    output.add(root / 'artifacts/site', arcname='dist')
result = {
    'commit': commit,
    'archive': str(archive),
    'bytes': archive.stat().st_size,
    'sha256': hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest(),
}
(root / 'artifacts/package-manifest.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))

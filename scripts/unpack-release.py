"""Verify the exact committed ZIP and extract a fresh source consumer."""
import argparse
import hashlib
import json
import stat
import subprocess
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
parser.add_argument('--archive')
args = parser.parse_args()
metadata = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
version = metadata['version']
archive = Path(args.archive).resolve() if args.archive else ROOT / 'release-artifacts' / f'outpost_{version}_source.zip'
checksum = hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name + '\n'
if archive.with_name(archive.name + '.sha256').read_text(encoding='utf-8') != checksum or (archive.parent / 'SHA256SUMS').read_text(encoding='utf-8') != checksum:
    raise ValueError('Source checksums differ')
destination = Path(args.out).resolve()
if destination.exists() or destination.is_relative_to(ROOT):
    raise ValueError('Use a new folder outside the checkout')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip()
tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')[:-1]
prefix = f'outpost-{version}/'
private = {'.git', 'node_modules', 'dist', '.wrangler', 'reports', 'release-artifacts', 'test-results', 'playwright-report', 'work', 'outputs', '.test-dist'}
with zipfile.ZipFile(archive) as package:
    names = package.namelist()
    if len(names) != len(set(names)) or len(names) != len({name.casefold() for name in names}) or package.testzip() is not None:
        raise ValueError('ZIP duplicate/case/CRC failure')
    if package.comment.decode() != commit:
        raise ValueError('ZIP commit identity differs')
    files = {}
    for entry in package.infolist():
        if not entry.filename.startswith(prefix):
            raise ValueError('ZIP prefix differs')
        name = entry.filename[len(prefix):]
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name:
            raise ValueError('Unsafe ZIP path')
        if any(part in private or part.startswith('.env') for part in path.parts) or name.endswith('.pem'):
            raise ValueError('Private/build ZIP entry')
        mode = stat.S_IFMT(entry.external_attr >> 16)
        if mode not in {0, stat.S_IFREG, stat.S_IFDIR}:
            raise ValueError('Linked/special ZIP entry')
        if not entry.is_dir():
            files[name] = package.read(entry)
    if set(files) != set(tracked):
        raise ValueError('ZIP differs from tracked source set')
    for name, data in files.items():
        expected = subprocess.check_output(['git', 'show', f'{commit}:{name}'], cwd=ROOT)
        if data != expected:
            raise ValueError('ZIP source bytes differ: ' + name)
    for name in ['LICENSE', 'README.md', 'pnpm-lock.yaml', 'docs/STABILITY.md', 'SECURITY.md']:
        if name not in files:
            raise ValueError('Missing release guide/license/lockfile')
    if metadata['license'] != 'MIT' or json.loads(files['package.json'])['license'] != 'MIT':
        raise ValueError('Release license metadata differs')
    destination.mkdir(parents=True)
    for name, data in files.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
print(json.dumps({'archive': archive.name, 'sha256': checksum.split()[0], 'version': version, 'commit': commit, 'sourceFiles': len(files), 'sourceBytes': 'match Git blobs', 'license': 'MIT', 'consumer': str(destination)}))

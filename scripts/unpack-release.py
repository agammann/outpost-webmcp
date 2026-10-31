"""Verify the exact committed ZIP and extract a fresh source consumer."""
import argparse
import hashlib
import io
import json
import stat
import struct
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
destination = Path(args.out).resolve()
if destination.exists() or destination.is_relative_to(ROOT):
    raise ValueError('Use a new folder outside the checkout')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip()
tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')[:-1]
tree = subprocess.check_output(['git', 'ls-tree', '-r', '-l', '-z', commit], cwd=ROOT).split(b'\0')[:-1]
sizes = {}
for item in tree:
    header, raw_name = item.split(b'\t', 1)
    mode, kind, _oid, size = header.split()
    if kind != b'blob' or mode not in {b'100644', b'100755'}:
        raise ValueError('Committed source contains non-regular files')
    sizes[raw_name.decode()] = int(size)
if set(tracked) != set(sizes):
    raise ValueError('Tracked files differ from committed source set')
prefix = f'outpost-{version}/'
private = {'.git', 'node_modules', 'dist', '.wrangler', 'reports', 'release-artifacts', 'test-results', 'playwright-report', 'work', 'outputs', '.test-dist'}
# Git archive emits one empty directory record per path prefix. Limit both the
# compressed archive and its central directory before ZipFile allocates entries.
directories = {prefix}
for name in tracked:
    parts = name.split('/')[:-1]
    for n in range(1, len(parts) + 1):
        directories.add(prefix + '/'.join(parts[:n]) + '/')
entry_limit = len(tracked) + len(directories)
archive_limit = sum(sizes.values()) + 1_048_576 + entry_limit * 1024
if archive.stat().st_size > archive_limit:
    raise ValueError('ZIP compressed size exceeds committed source bound')
digest = hashlib.sha256()
archive_bytes = bytearray()
with archive.open('rb') as source:
    for chunk in iter(lambda: source.read(65_536), b''):
        if len(archive_bytes) + len(chunk) > archive_limit:
            raise ValueError('ZIP compressed size exceeds committed source bound')
        archive_bytes.extend(chunk)
        digest.update(chunk)
checksum = digest.hexdigest() + '  ' + archive.name + '\n'
for sidecar in [archive.with_name(archive.name + '.sha256'), archive.parent / 'SHA256SUMS']:
    with sidecar.open('rb') as source:
        if source.read(len(checksum.encode()) + 1) != checksum.encode():
            raise ValueError('Source checksums differ')
comment = commit.encode()
size = len(archive_bytes)
if size < 22 + len(comment):
    raise ValueError('Invalid ZIP end record')
end_offset = size - 22 - len(comment)
signature, disk, start_disk, disk_entries, entries, central_size, central_offset, comment_size = struct.unpack_from('<4s4H2LH', archive_bytes, end_offset)
if (signature != b'PK\x05\x06' or disk or start_disk or disk_entries != entries or
        entries > entry_limit or entries == 0xffff or central_size == 0xffffffff or
        central_offset == 0xffffffff or comment_size != len(comment) or
        central_offset + central_size != end_offset or archive_bytes[end_offset + 22:] != comment):
    raise ValueError('ZIP central directory or commit identity differs')
# ZipFile does not enforce the EOCD's entry count while allocating ZipInfo
# objects. Count and bound actual central records before handing it the bytes.
offset, actual_entries = central_offset, 0
while offset < end_offset:
    if end_offset - offset < 46 or archive_bytes[offset:offset + 4] != b'PK\x01\x02':
        raise ValueError('Invalid ZIP central directory')
    name_length, extra_length, entry_comment_length = struct.unpack_from('<3H', archive_bytes, offset + 28)
    offset += 46 + name_length + extra_length + entry_comment_length
    actual_entries += 1
    if offset > end_offset or actual_entries > entry_limit:
        raise ValueError('ZIP central directory exceeds committed source bound')
if offset != end_offset or actual_entries != entries:
    raise ValueError('ZIP central directory count differs')
with zipfile.ZipFile(io.BytesIO(archive_bytes)) as package:
    names = package.namelist()
    if len(names) != len(set(names)) or len(names) != len({name.casefold() for name in names}):
        raise ValueError('ZIP duplicate/case failure')
    if package.comment.decode() != commit:
        raise ValueError('ZIP commit identity differs')
    members = {}
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
        if entry.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
            raise ValueError('Unsupported ZIP compression')
        if entry.is_dir():
            if entry.filename not in directories or entry.file_size != 0 or entry.CRC != 0:
                raise ValueError('ZIP directory differs from committed source')
        else:
            if name not in sizes or entry.file_size != sizes[name]:
                raise ValueError('ZIP file or size differs from committed source')
            members[name] = entry
    if set(members) != set(tracked):
        raise ValueError('ZIP differs from tracked source set')
    # Read only after every member has passed the committed-size check. Reading
    # each entry to EOF verifies CRC, and total retained bytes cannot exceed the
    # size of the committed Git blobs.
    files = {}
    for name, entry in members.items():
        data = bytearray()
        with package.open(entry) as source:
            while True:
                chunk = source.read(min(65_536, sizes[name] - len(data) + 1))
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > sizes[name]:
                    raise ValueError('ZIP expanded size differs from committed source')
        if len(data) != sizes[name]:
            raise ValueError('ZIP expanded size differs from committed source')
        files[name] = bytes(data)
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

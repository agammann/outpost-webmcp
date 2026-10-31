"""Bounded synthetic verifier tests; no user files or external services."""
import hashlib
import json
import os
import subprocess
import struct
import sys
import tempfile
import zlib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYTHON = sys.executable
RUNNER = '''import json,runpy,sys,tracemalloc
tracemalloc.start()
try:
 sys.argv=[sys.argv[1],"--archive",sys.argv[2],"--out",sys.argv[3]]
 runpy.run_path(sys.argv[0],run_name="__main__")
except Exception as exc:
 print(json.dumps({"failure":str(exc),"peak":tracemalloc.get_traced_memory()[1]}))
 sys.exit(1)
'''

def checksum(path):
    line = hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name + '\n'
    path.with_name(path.name + '.sha256').write_text(line, encoding='utf-8', newline='')
    (path.parent / 'SHA256SUMS').write_text(line, encoding='utf-8', newline='')

def run(path, dest):
    return subprocess.run([PYTHON, '-c', RUNNER, str(ROOT / 'scripts/unpack-release.py'), str(path), str(dest)], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')

with tempfile.TemporaryDirectory(prefix='outpost-zip-test-') as tmp:
    directory = Path(tmp)
    good = directory / 'good.zip'
    subprocess.run(['git', 'archive', '--format=zip', '--prefix=outpost-1.1.3/', '--output=' + str(good), 'HEAD'], cwd=ROOT, check=True)
    checksum(good)
    result = run(good, directory / 'good-output')
    assert result.returncode == 0, (result.stdout, result.stderr)
    assert (directory / 'good-output' / 'README.md').is_file()
    print('PASS legitimate committed release archive')
    for label, name in [('extra', 'outpost-1.1.3/unexpected.bin'), ('expected', 'outpost-1.1.3/README.md')]:
        crafted = directory / (label + '.zip')
        with zipfile.ZipFile(good) as original, zipfile.ZipFile(crafted, 'w', compression=zipfile.ZIP_DEFLATED) as changed:
            changed.comment = original.comment
            for info in original.infolist():
                if label == 'expected' and info.filename == name:
                    changed.writestr(info, b'A' * 4_000_000, compress_type=zipfile.ZIP_DEFLATED)
                else:
                    changed.writestr(info, original.read(info))
            if label == 'extra':
                changed.writestr(name, b'A' * 4_000_000)
        checksum(crafted)
        result = run(crafted, directory / (label + '-output'))
        assert result.returncode != 0, (label, result.stdout, result.stderr)
        assert not (directory / (label + '-output')).exists()
        record = json.loads(result.stdout.splitlines()[-1])
        print(f'{label}: rejected, traced peak={record["peak"]}')
        assert record['peak'] < 10_000_000, (label, record)
    print('PASS bounded synthetic oversized members')
    # A central directory can lie about entry counts. The parser must reject
    # the actual excess before allocating ZipInfo for every entry.
    spoof = directory / 'spoof-count.zip'
    with zipfile.ZipFile(good) as original, zipfile.ZipFile(spoof, 'w', compression=zipfile.ZIP_DEFLATED) as changed:
        changed.comment = original.comment
        for info in original.infolist():
            changed.writestr(info, original.read(info))
        for i in range(200):
            changed.writestr(f'outpost-1.1.3/extra-{i}', b'')
    raw = bytearray(spoof.read_bytes())
    end = len(raw) - 62
    struct.pack_into('<HH', raw, end + 8, 1, 1)
    spoof.write_bytes(raw)
    checksum(spoof)
    result = run(spoof, directory / 'spoof-output')
    assert result.returncode != 0 and 'central directory exceeds' in result.stdout, (result.stdout, result.stderr)
    print('PASS forged central entry count')

    # A forged member can claim the real blob's small size while compressing
    # much more data. BZIP2 is rejected and DEFLATE reads stay bounded.
    for method in (zipfile.ZIP_DEFLATED, zipfile.ZIP_BZIP2):
        forged = directory / f'forged-{method}.zip'
        name = 'outpost-1.1.3/README.md'
        with zipfile.ZipFile(good) as original, zipfile.ZipFile(forged, 'w') as changed:
            changed.comment = original.comment
            original_info = original.getinfo(name)
            for info in original.infolist():
                changed.writestr(info, b'A' * 4_000_000 if info.filename == name else original.read(info), compress_type=method if info.filename == name else info.compress_type)
        raw = bytearray(forged.read_bytes())
        with zipfile.ZipFile(forged) as package:
            info = package.getinfo(name)
            central = package.start_dir
        prefix_crc = zlib.crc32(b'A' * original_info.file_size)
        struct.pack_into('<I', raw, info.header_offset + 14, prefix_crc)
        struct.pack_into('<I', raw, info.header_offset + 22, original_info.file_size)
        while raw[central:central + 4] == b'PK\x01\x02':
            lengths = struct.unpack_from('<3H', raw, central + 28)
            current = bytes(raw[central + 46:central + 46 + lengths[0]]).decode('utf-8')
            if current == name:
                struct.pack_into('<I', raw, central + 16, prefix_crc)
                struct.pack_into('<I', raw, central + 24, original_info.file_size)
                break
            central += 46 + sum(lengths)
        else:
            raise AssertionError('target central record not found')
        forged.write_bytes(raw)
        checksum(forged)
        result = run(forged, directory / f'forged-output-{method}')
        assert result.returncode != 0, (method, result.stdout, result.stderr)
        record = json.loads(result.stdout.splitlines()[-1])
        assert record['peak'] < 10_000_000, (method, record)
        if method == zipfile.ZIP_BZIP2:
            assert 'Unsupported ZIP compression' in record['failure'], record
        print(f'PASS forged method={method}, traced peak={record["peak"]}')

    for label, mutate in [('crc', 'crc'), ('case', 'case'), ('traversal', 'traversal'), ('link', 'link')]:
        malformed = directory / (label + '.zip')
        with zipfile.ZipFile(good) as original, zipfile.ZipFile(malformed, 'w') as changed:
            changed.comment = original.comment
            for info in original.infolist():
                data = original.read(info)
                if mutate == 'link' and info.filename == 'outpost-1.1.3/README.md':
                    info.external_attr = 0o120777 << 16
                changed.writestr(info, data)
            if mutate == 'case':
                changed.writestr('outpost-1.1.3/readme.md', b'x')
            if mutate == 'traversal':
                changed.writestr('outpost-1.1.3/../outside', b'x')
        if mutate == 'crc':
            raw = bytearray(malformed.read_bytes())
            with zipfile.ZipFile(malformed) as package:
                info = package.getinfo('outpost-1.1.3/README.md')
                central = package.start_dir
            while raw[central:central + 4] == b'PK\x01\x02':
                lengths = struct.unpack_from('<3H', raw, central + 28)
                current = bytes(raw[central + 46:central + 46 + lengths[0]]).decode('utf-8')
                if current == info.filename:
                    wrong = info.CRC ^ 1
                    struct.pack_into('<I', raw, info.header_offset + 14, wrong)
                    struct.pack_into('<I', raw, central + 16, wrong)
                    break
                central += 46 + sum(lengths)
            malformed.write_bytes(raw)
        checksum(malformed)
        output = directory / (label + '-output')
        result = run(malformed, output)
        assert result.returncode != 0 and not output.exists(), (label, result.stdout, result.stderr)
        print(f'PASS rejects {label} without creating output')
    for label, sidecar in [('bad-sidecar', good.with_name(good.name + '.sha256')), ('large-sums', directory / 'SHA256SUMS')]:
        checksum(good)
        sidecar.write_bytes(b'x' * 65_536)
        output = directory / (label + '-output')
        result = run(good, output)
        assert result.returncode != 0 and not output.exists() and 'Source checksums differ' in result.stdout, (label, result.stdout, result.stderr)
        print(f'PASS rejects {label} without creating output')

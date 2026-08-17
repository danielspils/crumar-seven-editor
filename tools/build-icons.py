"""Builds build/icon.icns, build/icon.ico and build/icon.png.

    python3 tools/build-icons.py

WHY NOT JUST ONE PNG. electron-builder will happily generate both containers
from a single 1024px image, and the result is mush: at 32px the wordmark is
grey noise, at 16px it is gone. So each container is assembled here with the
right ART PER SIZE — the full drawing at 128px and up, the knob alone below
that — which is what every well-drawn desktop icon does.

Both drawings come from tools/make-icon.py, so they cannot drift.
"""
import json
import os
import shutil
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
WORK = os.path.join(BUILD, '.icons')

# The size at which the lettering stops being legible and starts being dirt.
LETTERING_FLOOR = 128

FULL = 'build/icon.svg'
SMALL = 'build/icon-small.svg'


def art_for(size):
    return FULL if size >= LETTERING_FLOOR else SMALL


# macOS wants both the 1x and the 2x of each nominal size, and iconutil is
# strict about the names.
ICNS = [
    (16, 'icon_16x16.png'), (32, 'icon_16x16@2x.png'),
    (32, 'icon_32x32.png'), (64, 'icon_32x32@2x.png'),
    (128, 'icon_128x128.png'), (256, 'icon_128x128@2x.png'),
    (256, 'icon_256x256.png'), (512, 'icon_256x256@2x.png'),
    (512, 'icon_512x512.png'), (1024, 'icon_512x512@2x.png'),
]
# Windows reads whichever entry fits: 16 and 32 in Explorer lists and the
# taskbar, 48 for medium icons, 256 for the big view and the installer.
ICO = [16, 24, 32, 48, 64, 128, 256]


def run(cmd):
    print('  $', ' '.join(cmd))
    subprocess.run(cmd, check=True, cwd=ROOT)


def write_ico(pngs, out):
    """A PNG-payload .ico. The format is a header, a directory, then the
    images; PNG payloads are read by everything since Vista, and keep the
    alpha that a BMP payload would need a mask for."""
    entries = []
    offset = 6 + 16 * len(pngs)
    blobs = []
    for size, path in pngs:
        data = open(path, 'rb').read()
        blobs.append(data)
        entries.append(struct.pack(
            '<BBBBHHII',
            0 if size >= 256 else size,   # 0 means 256 in this format
            0 if size >= 256 else size,
            0, 0, 1, 32, len(data), offset,
        ))
        offset += len(data)
    with open(out, 'wb') as f:
        f.write(struct.pack('<HHH', 0, 1, len(pngs)))
        for e in entries:
            f.write(e)
        for b in blobs:
            f.write(b)


def main():
    print('1. drawings')
    run([sys.executable, 'tools/make-icon.py'])

    shutil.rmtree(WORK, ignore_errors=True)
    iconset = os.path.join(WORK, 'icon.iconset')
    os.makedirs(iconset)

    jobs = []
    for size, name in ICNS:
        jobs.append({'svg': art_for(size), 'size': size,
                     'out': os.path.relpath(os.path.join(iconset, name), ROOT)})
    for size in ICO:
        jobs.append({'svg': art_for(size), 'size': size,
                     'out': os.path.relpath(os.path.join(WORK, f'ico-{size}.png'), ROOT)})
    # The 1024 master, which is also what the DMG background and any future
    # store listing would use.
    jobs.append({'svg': FULL, 'size': 1024, 'out': 'build/icon.png'})

    jobs_file = os.path.join(WORK, 'jobs.json')
    open(jobs_file, 'w').write(json.dumps(jobs))

    print('2. rendering')
    run(['npx', 'electron', 'tools/render-icons.js', jobs_file])

    print('3. containers')
    run(['iconutil', '-c', 'icns', os.path.relpath(iconset, ROOT),
         '-o', 'build/icon.icns'])
    write_ico([(s, os.path.join(WORK, f'ico-{s}.png')) for s in ICO],
              os.path.join(BUILD, 'icon.ico'))
    print('  build/icon.ico')

    for f in ('icon.icns', 'icon.ico', 'icon.png'):
        p = os.path.join(BUILD, f)
        print(f'  {f}: {os.path.getsize(p):,} bytes')


if __name__ == '__main__':
    main()

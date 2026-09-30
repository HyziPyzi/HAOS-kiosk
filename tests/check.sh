#!/usr/bin/env bash
set -euo pipefail
export PYTHONPATH=/src/haoskiosk
bash -n haoskiosk/run.sh
shellcheck -S warning haoskiosk/run.sh
python3 - <<'PY'
import ast
import json
from pathlib import Path
import yaml

for path in Path('haoskiosk').rglob('*.py'):
    ast.parse(path.read_text(), filename=str(path))
for path in Path('.').rglob('*.yaml'):
    yaml.safe_load(path.read_text())
json.loads(Path('repository.json').read_text())
config = yaml.safe_load(Path('haoskiosk/config.yaml').read_text())
assert config['arch'] == ['amd64']
assert config['slug'] == 'haoskiosk_chrome'
assert config['video'] and config['audio']
assert not any('/dev/dri' in d for d in config['devices'])
assert config['options']['browser_engine'] == 'chrome'
assert config['options']['keyboard_layout'] == 'pl'
assert config['options']['screen_timeout'] == 0
for path in (Path('haoskiosk/Dockerfile'), Path('haoskiosk/run.sh')):
    text = path.read_text().lower()
    assert 'apk ' not in text and '/var/cache/apk' not in text
    assert 'alpinelinux.org' not in text
print('PASS: YAML/JSON, Python syntax, architecture, defaults and Debian migration')
PY

for tool in Xorg xrandr xinput xdotool xset setxkbmap libinput udevadm \
    openbox onboard unclutter x11vnc pactl python3 dbus-daemon dbus-send \
    dconf gsettings scrot jq pgrep mount mknod column bashio \
    find sort awk sed grep cat cp mv rm readlink basename dirname xargs tr date uname timeout; do
    command -v "$tool" >/dev/null
done
test -x /usr/lib/systemd/systemd-udevd
test -f /usr/lib/xorg/modules/drivers/modesetting_drv.so
test -f /usr/lib/xorg/modules/input/libinput_drv.so
python3 -c 'import aiohttp, Xlib'
google-chrome-stable --version
if find /opt/google/chrome -name libwidevinecdm.so -print | grep .; then
    echo 'PASS: Google-packaged Widevine library found (playback still requires hardware/service tests)'
fi
python3 -m unittest discover -s tests -p 'test_*.py' -v

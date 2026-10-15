"""Run inside the official stable Supervisor image, without starting Supervisor."""
from pathlib import Path
import yaml
from supervisor.apps.validate import SCHEMA_APP_CONFIG
from supervisor.apps.options import AppOptions

config = SCHEMA_APP_CONFIG(yaml.safe_load(Path('/src/haoskiosk/config.yaml').read_text()))
# These options contain no device selectors or secret references, so validating
# their types does not require live CoreSys services or HA hardware.
options = AppOptions(None, config['schema'], config['name'], config['slug']).validate(config['options'])
assert options['browser_engine'] == 'chrome'
assert options['start_page'] == 'launcher'
assert options['audio_sink'] == 'auto'
assert options['adblock_mode'] == 'optimal'
assert 'netflix.com' in options['adblock_excluded_domains']
for mode in ('off', 'optimal', 'complete'):
    AppOptions(None, config['schema'], config['name'], config['slug']).validate(
        {**config['options'], 'adblock_mode': mode, 'adblock_excluded_domains': []})
print('PASS: official stable Supervisor app schema and default options')

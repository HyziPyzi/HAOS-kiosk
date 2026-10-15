"""Generate the kiosk-owned native Google Chrome policy before browser startup."""

import argparse
import json
import os
from pathlib import Path
import re
import tempfile


EXTENSION_ID = 'ddkjiahejlhfcafbddmgiahcphecmpfh'
UPDATE_URL = 'https://clients2.google.com/service/update2/crx'
POLICY_PATH = Path('/etc/opt/chrome/policies/managed/haoskiosk-ublock-origin-lite.json')
DEFAULT_EXCLUDED_DOMAINS = (
    'netflix.com', 'max.com', 'hbomax.com', 'primevideo.com',
    'amazon.com', 'amazon.de', 'amazon.co.uk', 'amazon.pl',
)
HOSTNAME = re.compile(r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+'
                      r'[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?')


def build_policy(options):
    mode = options.get('adblock_mode', 'optimal')
    if mode not in ('off', 'optimal', 'complete'):
        raise ValueError('adblock_mode must be off, optimal or complete')
    domains = options.get('adblock_excluded_domains', list(DEFAULT_EXCLUDED_DOMAINS))
    if not isinstance(domains, list):
        raise ValueError('adblock_excluded_domains must be a list of hostnames')
    normalized = []
    for domain in domains:
        if not isinstance(domain, str):
            raise ValueError('adblock_excluded_domains must contain only hostnames')
        hostname = domain.strip().lower().removesuffix('.')
        if len(hostname) > 253 or not HOSTNAME.fullmatch(hostname):
            raise ValueError('adblock_excluded_domains requires bare hostnames, without URLs or wildcards')
        if hostname not in normalized:
            normalized.append(hostname)
    return {
        'ExtensionSettings': {
            EXTENSION_ID: {
                'installation_mode': 'blocked' if mode == 'off' else 'normal_installed',
                'update_url': UPDATE_URL,
            },
        },
        '3rdparty': {
            'extensions': {
                EXTENSION_ID: {
                    'defaultFiltering': 'none' if mode == 'off' else mode,
                    'noFiltering': normalized,
                    'disableFirstRunPage': True,
                },
            },
        },
    }


def write_policy(options, path=POLICY_PATH):
    policy = build_policy(options)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix='.haoskiosk-', delete=False) as output:
            temporary_path = Path(output.name)
            json.dump(policy, output, indent=2)
            output.write('\n')
        temporary_path.chmod(0o644)
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return policy


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--options', type=Path, default=Path('/data/options.json'))
    args = parser.parse_args()
    try:
        options = json.loads(args.options.read_text(encoding='utf-8'))
        if not isinstance(options, dict):
            raise ValueError('options must be a JSON object')
        policy = write_policy(options)
    except (OSError, ValueError) as error:
        parser.exit(1, f'Chrome adblock policy: {error}\n')
    settings = policy['3rdparty']['extensions'][EXTENSION_ID]
    print(f'Chrome uBlock Origin Lite policy: {settings["defaultFiltering"]}; '
          f'{len(settings["noFiltering"])} excluded domains; {POLICY_PATH}')
    print('Chrome installs/updates the official extension asynchronously; verify chrome://policy and chrome://extensions.')


if __name__ == '__main__':
    main()

"""Policy generation, upgrade defaults and safe replacement of kiosk policy."""

import json
from pathlib import Path
import tempfile
import unittest

import yaml

import chrome_policy as policy


class ChromePolicyTests(unittest.TestCase):
    def test_upgrade_defaults_match_supervisor(self):
        options = yaml.safe_load(Path('haoskiosk/config.yaml').read_text())['options']
        self.assertEqual(policy.build_policy({}), policy.build_policy(options))
        extension = policy.build_policy({})['ExtensionSettings'][policy.EXTENSION_ID]
        self.assertEqual(extension['installation_mode'], 'normal_installed')
        self.assertEqual(extension['update_url'], 'https://clients2.google.com/service/update2/crx')

    def test_modes_exclusions_and_normalization(self):
        for mode in ('off', 'optimal', 'complete'):
            result = policy.build_policy({'adblock_mode': mode, 'adblock_excluded_domains':
                                          [' Netflix.COM. ', 'netflix.com', 'vod.example.org']})
            extension = result['ExtensionSettings'][policy.EXTENSION_ID]
            managed = result['3rdparty']['extensions'][policy.EXTENSION_ID]
            self.assertEqual(extension['installation_mode'], 'blocked' if mode == 'off' else 'normal_installed')
            self.assertEqual(managed, {'defaultFiltering': 'none' if mode == 'off' else mode,
                                      'noFiltering': ['netflix.com', 'vod.example.org'],
                                      'disableFirstRunPage': True})
        result = policy.build_policy({'adblock_excluded_domains': []})
        self.assertEqual(result['3rdparty']['extensions'][policy.EXTENSION_ID]['noFiltering'], [])

    def test_invalid_options_cannot_inject_ubol_directives(self):
        for mode in ('basic', '', None, False, [], {}):
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                policy.build_policy({'adblock_mode': mode})
        for domains in ('netflix.com', None, [123], [''], ['https://netflix.com/'],
                        ['*.max.com'], ['-netflix.com'], ['-*'], ['all-urls'],
                        ['com'], ['example.com:443'], ['bad host.com'],
                        ['a' * 64 + '.com'], ['good.com\nevil.com']):
            with self.subTest(domains=domains), self.assertRaises(ValueError):
                policy.build_policy({'adblock_excluded_domains': domains})

    def test_only_owned_policy_replaced_and_invalid_input_preserves_it(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            owned = root / 'managed/kiosk.json'
            profile = root / 'profile/Default/Preferences'
            profile.parent.mkdir(parents=True)
            profile.write_text('profile sentinel')
            policy.write_policy({}, owned)
            other = owned.parent / 'other.json'
            other.write_text('{"UnrelatedPolicy":true}')
            for mode in ('complete', 'off', 'optimal'):
                expected = policy.write_policy({'adblock_mode': mode}, owned)
                self.assertEqual(json.loads(owned.read_text()), expected)
                self.assertEqual(other.read_text(), '{"UnrelatedPolicy":true}')
                self.assertEqual(profile.read_text(), 'profile sentinel')
                self.assertEqual(sorted(path.name for path in owned.parent.iterdir()), ['kiosk.json', 'other.json'])
            before = owned.read_bytes()
            with self.assertRaises(ValueError):
                policy.write_policy({'adblock_excluded_domains': ['https://bad.test']}, owned)
            self.assertEqual(owned.read_bytes(), before)

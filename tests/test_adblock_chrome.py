"""Online test: Chrome Web Store installation through native Linux policies.

Runs in the disposable root-owned test container, with a temporary browser profile.
No CRX download, unpacked extension or VOD account is used by the test harness.
"""

import asyncio
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import browser_ctl as browser
import chrome_policy as policy
from chromium_watchdog import extract_evaluate_value


class AdblockChromeTests(unittest.IsolatedAsyncioTestCase):
    async def test_web_store_policy_modes_exceptions_and_restart(self):
        policy_path = policy.POLICY_PATH
        previous = policy_path.read_bytes() if policy_path.exists() else None
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            log = open(root / 'chrome.log', 'w')
            xvfb = subprocess.Popen(['Xvfb', ':97', '-screen', '0', '1280x720x24',
                                     '-nolisten', 'tcp'], stdout=log, stderr=log)
            chrome = None
            controller = browser.ChromiumController(port=9224)
            extension_id = json.dumps(policy.EXTENSION_ID)

            async def value(expression):
                result = await controller.evaluate(expression, await_promise=True)
                if 'exceptionDetails' in result:
                    raise RuntimeError(str(result['exceptionDetails']))
                return extract_evaluate_value(result)

            async def wait_value(expression, predicate, timeout=30):
                deadline = asyncio.get_running_loop().time() + timeout
                last = None
                while asyncio.get_running_loop().time() < deadline:
                    try:
                        last = await value(expression)
                        if predicate(last):
                            return last
                    except (OSError, RuntimeError, asyncio.TimeoutError) as error:
                        last = str(error)
                    await asyncio.sleep(0.25)
                self.fail(f'Chrome policy check timed out: {expression}: {last}\n'
                          + (root / 'chrome.log').read_text()[-12000:])

            async def navigate(url):
                async def worker(page, _):
                    await page.call('Page.navigate', {'url': url})
                await controller._with_page(worker)
                await wait_value('location.href', lambda current: current == url)

            async def extension_info(enabled):
                return await wait_value(
                    f'chrome.management.get({extension_id}).then(info => '
                    '({enabled:info.enabled,mayDisable:info.mayDisable,version:info.version}))',
                    lambda info: isinstance(info, dict) and info.get('enabled') is enabled,
                    timeout=180)

            async def check_filtering(options):
                await navigate(f'chrome-extension://{policy.EXTENSION_ID}/dashboard.html')
                await wait_value('chrome.runtime.id', lambda current: current == policy.EXTENSION_ID)
                self.assertEqual(await value('chrome.runtime.getManifest().manifest_version'), 3)
                expected = policy.build_policy(options)['3rdparty']['extensions'][policy.EXTENSION_ID]
                await wait_value('chrome.storage.managed.get(null)', lambda managed: managed == expected)
                expected_level = 2 if options['adblock_mode'] == 'optimal' else 3
                await wait_value('chrome.runtime.sendMessage({what:"getOptionsPageData"})',
                                 lambda data: isinstance(data, dict)
                                 and data.get('defaultFilteringMode') == expected_level
                                 and data.get('hasOmnipotence') is True)
                for hostname in (*policy.DEFAULT_EXCLUDED_DOMAINS, 'www.netflix.com',
                                 'play.max.com', 'www.primevideo.com', 'vod.example.org',
                                 'netflix.com.example.org'):
                    excluded = any(hostname == domain or hostname.endswith('.' + domain)
                                   for domain in expected['noFiltering'])
                    expected_site = 0 if excluded else expected_level
                    await wait_value('chrome.runtime.sendMessage({what:"getFilteringMode",hostname:'
                                     + json.dumps(hostname) + '})', lambda level: level == expected_site)
                self.assertTrue(await value('chrome.declarativeNetRequest.getEnabledRulesets()'))

            try:
                for _ in range(60):
                    if Path('/tmp/.X11-unix/X97').exists():
                        break
                    await asyncio.sleep(0.1)
                source = Path('haoskiosk/run.sh').read_text()
                start = source.index('resolve_browser_binary()')
                end = source.index('\nbrowser_process_running()', start)
                script = 'BROWSER_ENGINE=chrome\nCHROMIUM_PROFILE_DIR="$1"\n'
                script += source[start:end] + '\nresolve_browser_binary\nexec "$BROWSER" "${BROWSER_FLAGS[@]}" chrome://extensions/\n'
                for iteration, mode in enumerate(('optimal', 'optimal', 'complete', 'off', 'optimal', 'optimal')):
                    options = {'adblock_mode': mode}
                    if mode != 'off':
                        options['adblock_excluded_domains'] = [*policy.DEFAULT_EXCLUDED_DOMAINS, 'vod.example.org']
                    if iteration >= 4:
                        options['adblock_excluded_domains'] = []
                    policy.write_policy(options)
                    chrome = subprocess.Popen(['bash', '-c', script, 'test', str(root / 'profile')],
                                              env={**os.environ, 'DISPLAY': ':97', 'CHROMIUM_DEVTOOLS_PORT': '9224'},
                                              stdout=log, stderr=log)
                    await wait_value('document.readyState', lambda state: state == 'complete')
                    await navigate('chrome://extensions/')
                    info = await extension_info(mode != 'off' and iteration != 5)
                    if mode != 'off' and iteration != 5:
                        self.assertTrue(info['mayDisable'])
                        await check_filtering(options)
                        if iteration == 0:
                            await value('chrome.storage.local.set({kioskPolicyTest:"retained"})')
                        else:
                            self.assertEqual(await value('chrome.storage.local.get("kioskPolicyTest")'),
                                             {'kioskPolicyTest': 'retained'})
                    if iteration == 4:
                        await navigate('chrome://extensions/')
                        await value(f'chrome.management.setEnabled({extension_id}, false)')
                        await extension_info(False)
                    print(f'PASS: uBOL {info["version"]}, {mode}, restart {iteration}, enabled={info["enabled"]}')
                    await controller.close()
                    await asyncio.to_thread(chrome.wait, 15)
                    chrome = None
            finally:
                if chrome is not None:
                    chrome.terminate()
                    try:
                        await asyncio.to_thread(chrome.wait, 10)
                    except subprocess.TimeoutExpired:
                        chrome.kill()
                        chrome.wait()
                xvfb.terminate()
                xvfb.wait(timeout=10)
                log.close()
                if previous is None:
                    policy_path.unlink(missing_ok=True)
                else:
                    policy_path.write_bytes(previous)

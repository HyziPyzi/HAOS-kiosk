"""Verify uBOL settings and use its settings-panel messages if policies lag."""

import argparse
import asyncio
import json
import os
from pathlib import Path
import tempfile

from aiohttp import ClientSession, ClientTimeout

from browser_ctl import ChromiumController, ChromiumPageSession
from chrome_policy import EXTENSION_ID, POLICY_PATH


MARKER = 'haoskiosk-adblock-config'
STATE_PATH = Path('/config/ubol-managed-state.json')


def reconcile_exclusions(current, desired, previously_owned):
    retained = [domain for domain in current if domain not in previously_owned or domain in desired]
    owned = [domain for domain in previously_owned if domain in desired]
    for domain in desired:
        if domain not in retained:
            retained.append(domain)
            if domain not in owned:
                owned.append(domain)
    return retained, owned


def save_state(path, owned, disabled_by_kiosk=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                     prefix='.ubol-state-', delete=False) as output:
        temporary = Path(output.name)
        json.dump({'owned_exclusions': owned, 'disabled_by_kiosk': disabled_by_kiosk}, output)
    try:
        temporary.chmod(0o600)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


async def configure(policy_path=POLICY_PATH, state_path=STATE_PATH, port=9222):
    policy = json.loads(Path(policy_path).read_text())
    expected = policy['3rdparty']['extensions'][EXTENSION_ID]
    desired_level = {'none': 0, 'optimal': 2, 'complete': 3}[expected['defaultFiltering']]
    state_path = Path(state_path)
    previous = json.loads(state_path.read_text()) if state_path.exists() else {}
    previously_owned = previous.get('owned_exclusions', [])
    controller = ChromiumController(port=port)
    async with ClientSession(timeout=ClientTimeout(total=10)) as client:
        while True:
            try:
                async with client.get(f'http://127.0.0.1:{port}/json/version') as response:
                    response.raise_for_status()
                    version = await response.json()
                break
            except OSError:
                await asyncio.sleep(0.5)
        async with client.ws_connect(version['webSocketDebuggerUrl']) as websocket:
            browser = ChromiumPageSession(websocket)
            target_id = None
            try:
                created = await browser.call('Target.createTarget', {
                    'url': f'chrome://extensions/?{MARKER}', 'background': True})
                target_id = created['targetId']
                while True:
                    targets = await controller.list_targets()
                    target = next((item for item in targets if item.get('id') == target_id), None)
                    if target and target.get('webSocketDebuggerUrl'):
                        break
                    await asyncio.sleep(0.1)
                async with client.ws_connect(target['webSocketDebuggerUrl']) as page_websocket:
                    page = ChromiumPageSession(page_websocket)

                    async def evaluate(expression):
                        result = await page.call('Runtime.evaluate', {
                            'expression': expression, 'awaitPromise': True, 'returnByValue': True})
                        if 'exceptionDetails' in result:
                            raise RuntimeError('uBOL settings panel returned a script error')
                        return result.get('result', {}).get('value')

                    async def wait_value(expression):
                        while True:
                            try:
                                result = await evaluate(expression)
                                if result:
                                    return result
                            except RuntimeError:
                                pass
                            await asyncio.sleep(0.25)

                    extension_id = json.dumps(EXTENSION_ID)
                    info = await wait_value(f'chrome.management.get({extension_id})'
                                            '.then(info => ({enabled:info.enabled,version:info.version})).catch(() => null)')
                    if desired_level == 0:
                        if info['enabled']:
                            await evaluate(f'chrome.management.setEnabled({extension_id}, false)')
                        save_state(state_path, previously_owned,
                                   disabled_by_kiosk=info['enabled'] or previous.get('disabled_by_kiosk', False))
                        return 'uBOL: disabled by kiosk; extension data retained'
                    if not info['enabled'] and previous.get('disabled_by_kiosk'):
                        await evaluate(f'chrome.management.setEnabled({extension_id}, true)')
                        info = await wait_value(f'chrome.management.get({extension_id})'
                                                '.then(info => info.enabled ? {enabled:true,version:info.version} : null)')
                    if not info['enabled']:
                        return 'uBOL: extension is disabled; settings left unchanged'
                    await page.call('Page.navigate', {
                        'url': f'chrome-extension://{EXTENSION_ID}/dashboard.html?{MARKER}'})
                    await wait_value(f'chrome.runtime.id === {extension_id}')
                    managed = await wait_value('chrome.storage.managed.get(null)')
                    if managed != expected:
                        raise RuntimeError('uBOL managed policy mismatch; check chrome://policy for conflicts')

                    async def message(what, **parameters):
                        request = json.dumps({'what': what, **parameters})
                        return await evaluate(f'chrome.runtime.sendMessage({request})')

                    await asyncio.sleep(1)
                    data = await message('getOptionsPageData')
                    modes = await message('getFilteringModeDetails')
                    if not isinstance(data, dict) or not isinstance(modes, dict):
                        raise RuntimeError('Unsupported uBOL settings-panel response')
                    fallback = False
                    if data['defaultFilteringMode'] != desired_level:
                        await message('setDefaultFilteringMode', level=desired_level)
                        modes = await message('getFilteringModeDetails')
                        fallback = True
                    exclusions, owned = reconcile_exclusions(
                        modes['none'], expected['noFiltering'], previously_owned)
                    if exclusions != modes['none']:
                        await message('setFilteringModeDetails', modes={**modes, 'none': exclusions})
                        fallback = True
                    data = await message('getOptionsPageData')
                    if data['defaultFilteringMode'] != desired_level:
                        raise RuntimeError('uBOL did not apply the requested filtering mode')
                    for hostname in expected['noFiltering']:
                        if await message('getFilteringMode', hostname=hostname) != 0:
                            raise RuntimeError('uBOL did not apply a configured site exception')
                    save_state(state_path, owned)
                    method = 'settings-panel fallback' if fallback else 'native managed settings'
                    return f'uBOL {info["version"]}: verified {expected["defaultFiltering"]}, {len(expected["noFiltering"])} exceptions ({method})'
            finally:
                if target_id is not None:
                    await browser.call('Target.closeTarget', {'targetId': target_id})


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timeout', type=float, default=180)
    args = parser.parse_args()
    try:
        result = await asyncio.wait_for(configure(port=int(os.getenv('CHROMIUM_DEVTOOLS_PORT', '9222'))), args.timeout)
        print(result)
        return 0
    except Exception as error:
        print(f'uBOL configuration could not be verified: {type(error).__name__}: {error}')
        return 1


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))

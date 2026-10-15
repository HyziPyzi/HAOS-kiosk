"""Local launcher security, actual Chrome keyboard navigation and Openbox shortcut.

External service URLs are checked, then replaced with local fixtures for playback-
independent navigation tests. No VOD accounts, physical HID or Bluetooth claims.
"""
import asyncio
import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import socket
import sys

from aiohttp import ClientSession, web
from aiohttp.test_utils import TestClient, TestServer, make_mocked_request

import browser_ctl as browser
import chromium_watchdog as watchdog
import rest_server as rest


class LauncherSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def test_lan_binding_also_serves_loopback_with_api_auth(self):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        process = subprocess.Popen(['python3', 'haoskiosk/rest_server.py'], env={**os.environ, 'REST_IP': '127.0.0.2', 'REST_PORT': str(port), 'REST_BEARER_TOKEN': 'test-secret'}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            async with ClientSession() as session:
                for _ in range(80):
                    try:
                        async with session.get(f'http://127.0.0.1:{port}/launcher') as response:
                            if response.status == 200: break
                    except OSError:
                        pass
                    await asyncio.sleep(0.05)
                else:
                    self.fail('Loopback launcher listener did not start alongside configured listener')
                for address in ('127.0.0.1', '127.0.0.2'):
                    async with session.post(f'http://{address}:{port}/launch_url', json={'url': 'https://www.netflix.com/'}) as response:
                        self.assertEqual(response.status, 401)
        finally:
            process.terminate()
            await asyncio.to_thread(process.wait, 10)

    async def test_local_ui_with_token_does_not_unlock_rest(self):
        with patch.object(rest, 'REST_BEARER_TOKEN', 'test-secret'):
            async with TestClient(TestServer(await rest.create_app())) as client:
                for path in ('/launcher', '/launcher/', '/launcher/app.js', '/launcher/style.css', '/launcher/config'):
                    response = await client.get(path)
                    self.assertEqual(response.status, 200, path)
                    self.assertIn("frame-ancestors 'none'", response.headers['Content-Security-Policy'])
                    self.assertNotIn('test-secret', await response.text())
                font = await client.get('/launcher/fonts/manrope-latin.woff2')
                self.assertEqual((font.status, font.content_type), (200, 'font/woff2'))
                config = await (await client.get('/launcher/config')).json()
                self.assertEqual(set(config), {'ha_url'})
                self.assertEqual((await client.post('/launch_url', json={'url': 'https://www.netflix.com/'})).status, 401)
                self.assertEqual((await client.post('/launcher', json={})).status, 403)
                self.assertEqual((await client.get('/launcher', headers={'Host': 'evil.test'})).status, 403)
                self.assertEqual((await client.get('/launcher', headers={'Origin': 'https://www.netflix.com'})).status, 403)
                self.assertEqual((await client.get('/launcher/not-a-file')).status, 404)
                for path in ('/launcher/../rest_server.py', '/launcher/%2e%2e/rest_server.py', '/launcher/fonts/../../run.sh', '/launcher/OFL.txt', '/launcher/deep/x/app.js'):
                    self.assertEqual((await client.get(path)).status, 404, path)
                with patch.object(rest, 'DEFAULT_LAUNCH_URL', 'http://user:password@localhost:8123/'):
                    self.assertEqual((await client.get('/launcher/config')).status, 400)

    async def test_lan_and_forwarded_headers_are_denied(self):
        class Transport:
            def get_extra_info(self, name, default=None):
                return ('192.0.2.5', 12345) if name == 'peername' else default
        async def handler(_):
            return web.Response(text='Should not reach this')
        for path in ('/launcher', '/launcher/config', '/launcher/app.js'):
            request = make_mocked_request('GET', path, headers={'Host': '127.0.0.1:8080', 'X-Forwarded-For': '127.0.0.1'}, transport=Transport())
            self.assertEqual((await rest.security_middleware(request, handler)).status, 403)

class LauncherStartupTests(unittest.TestCase):
    def test_start_page_choice_and_http_failure_fallback(self):
        source = Path('haoskiosk/run.sh').read_text()
        startup = source[source.index('# Preserve the old HA startup'):source.index('#### Optionally start vnc server')]
        stub = '''
bashio::log.info() { :; }
bashio::log.warning() { :; }
curl() { [ "$TEST_SERVER_READY" = true ]; }
sleep() { :; }
REST_PID=$$
'''
        for mode, ready, expected in (('launcher', 'true', 'http://127.0.0.1:8080/launcher'), ('launcher', 'false', 'http://localhost:8123/lovelace/tv'), ('home_assistant', 'true', 'http://localhost:8123/lovelace/tv')):
            result = subprocess.run(['bash', '-euo', 'pipefail', '-c', stub + startup + '\nprintf "%s" "$START_URL"'], env={**os.environ, 'START_PAGE': mode, 'TEST_SERVER_READY': ready, 'HA_URL': 'http://localhost:8123/', 'HA_DASHBOARD': '/lovelace/tv', 'LAUNCHER_URL': 'http://127.0.0.1:8080/launcher'}, capture_output=True, text=True, check=True)
            self.assertEqual(result.stdout, expected)

class LauncherChromeTests(unittest.IsolatedAsyncioTestCase):
    async def test_keyboard_sites_dialog_rest_and_global_shortcut(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            log = open(root / 'desktop.log', 'w')
            xvfb = subprocess.Popen(['Xvfb', ':98', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], stdout=log, stderr=log)
            chrome = wm = None
            # Real v3 API and storage in a temp DB; only the CDP port differs from production.
            with patch.dict(os.environ, {'SMART_TV_DB': str(root / 'smart-tv.sqlite3')}):
                app = await rest.create_app()
            app['smart_tv'].browser = browser.ChromiumController(port=9223)
            fixtures = web.Application()
            fixtures.router.add_get('/fixture/{name}', lambda r: web.Response(text='<html><title>' + r.match_info['name'] + '</title><script>document.addEventListener("keydown", e => { e.preventDefault(); e.stopImmediatePropagation(); }, true);</script><h1>Local navigation fixture</h1></html>', content_type='text/html'))
            fixture_runner = web.AppRunner(fixtures, access_log=None)
            await fixture_runner.setup()
            await web.TCPSite(fixture_runner, '127.0.0.1', 8767).start()
            runner = web.AppRunner(app, access_log=None)
            await runner.setup()
            await web.TCPSite(runner, '127.0.0.1', 8766).start()
            launcher_url = 'http://127.0.0.1:8766/launcher'
            controller = browser.ChromiumController(port=9223)
            async def value(expression):
                result = await controller.evaluate(expression, await_promise=True)
                self.assertNotIn('exceptionDetails', result, result)
                return watchdog.extract_evaluate_value(result)
            async def wait_for(expression):
                for _ in range(100):
                    try:
                        if await value(expression):
                            return
                    except Exception:
                        pass
                    await asyncio.sleep(0.05)
                details = await value('({url:location.href,title:document.title,focus:document.activeElement.id || document.activeElement.dataset.key,layers:document.querySelectorAll(".layer").length,toast:document.querySelector("#toast")?.textContent})')
                self.fail('Timed out: ' + expression + '; page=' + str(details))
            async def key(name):
                codes = {'ArrowRight': 39, 'ArrowLeft': 37, 'ArrowUp': 38, 'ArrowDown': 40, 'Enter': 13, 'Backspace': 8, 'Escape': 27, 'BrowserBack': 166}
                async def worker(page, _):
                    await page.call('Page.bringToFront')
                    params = {'key': name, 'windowsVirtualKeyCode': codes[name]}
                    await page.call('Input.dispatchKeyEvent', {'type': 'keyDown', **params})
                    await page.call('Input.dispatchKeyEvent', {'type': 'keyUp', **params})
                await controller._with_page(worker)
            async def return_home():
                # When reloading the same URL the old DOM is still a launcher.
                # Do not send test keys or replace fixture URLs until the new
                # document commits; otherwise the pending reload wins the race.
                await value('window.__kiosk_test_old_document = true')
                await controller.navigate(launcher_url)
                await wait_for('!window.__kiosk_test_old_document && document.activeElement?.dataset?.key === "fav:netflix"')
            try:
                for _ in range(60):
                    if Path('/tmp/.X11-unix/X98').exists(): break
                    await asyncio.sleep(0.1)
                env = {**os.environ, 'DISPLAY': ':98', 'HOME': str(root), 'REST_PORT': '8766', 'CHROMIUM_DEVTOOLS_PORT': '9223'}
                source = Path('haoskiosk/run.sh').read_text()
                # Build the exact production Openbox configuration, without Xorg/GPU setup.
                config_script = source[source.index('mkdir -p ~/.config/openbox'):source.index('# Start openbox')]
                subprocess.run(['bash', '-euo', 'pipefail', '-c', config_script], env=env, check=True)
                rc = root / '.config/openbox/rc.xml'
                tree = ET.parse(rc)
                binds = [node for node in tree.iter() if node.tag.endswith('keybind') and node.get('key') == 'C-A-h']
                self.assertEqual(len(binds), 1)
                self.assertIn('/browser_ctl.py launcher', ''.join(binds[0].itertext()))
                wm = subprocess.Popen(['openbox', '--config-file', str(rc), '--sm-disable'], env=env, stdout=log, stderr=log)
                start = source.index('resolve_browser_binary()')
                end = source.index('\nbrowser_process_running()', start)
                script = 'BROWSER_ENGINE=chrome\nCHROMIUM_PROFILE_DIR="$1"\n' + source[start:end]
                script += '\nresolve_browser_binary\nexec "$BROWSER" "${BROWSER_FLAGS[@]}" "$2"\n'
                chrome = subprocess.Popen(['bash', '-c', script, 'test', str(root / 'profile'), launcher_url], env=env, stdout=log, stderr=log)
                await wait_for('document.activeElement?.dataset?.key === "fav:netflix"')
                await wait_for('document.querySelector("#clock").textContent.length > 0')
                geometry = await value('({w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth,scroll:document.documentElement.scrollHeight,tiles:[...document.querySelectorAll("[data-row=fav] .tile")].map(t=>({w:t.offsetWidth,h:t.offsetHeight}))})')
                self.assertEqual(geometry['w'], 1920)
                self.assertLessEqual(geometry['scroll'], geometry['h'])
                self.assertLessEqual(geometry['scrollW'], geometry['w'])
                self.assertTrue(geometry['tiles'] and all(t['w'] >= 300 and t['h'] >= 180 for t in geometry['tiles']))
                async def screenshot(page, _):
                    return await page.call('Page.captureScreenshot', {'format': 'png'})
                shot = await controller._with_page(screenshot)
                screenshot_dir = Path(os.getenv('LAUNCHER_SCREENSHOT_DIR', '/tmp'))
                screenshot_dir.mkdir(parents=True, exist_ok=True)
                (screenshot_dir / 'tv-launcher-1080.png').write_bytes(base64.b64decode(shot['data']))
                # Default favourites come from the real v3 store, in order.
                self.assertEqual(await value('[...document.querySelectorAll("[data-row=fav] .tile")].map(t=>t.dataset.key)'), ['fav:netflix', 'fav:max', 'fav:prime', 'fav:youtube'])
                focus = 'document.activeElement.dataset.key'
                async def focus_key(name):
                    return await value(f'(() => {{ document.querySelector(`[data-key="{name}"]`).focus(); return document.activeElement.dataset.key; }})()')
                await key('ArrowLeft')
                self.assertEqual(await value(focus), 'fav:netflix')
                await key('ArrowRight')
                self.assertEqual(await value(focus), 'fav:max')
                await key('ArrowDown')
                self.assertTrue((await value(focus)).startswith('app:'))
                await key('ArrowUp')
                self.assertEqual(await value(focus), 'fav:max')  # rows remember their item
                self.assertEqual(await focus_key('app:browser'), 'app:browser')
                await key('Enter')
                await wait_for('document.activeElement?.id === "url-input"')
                await controller.evaluate('document.querySelector("#url-input").value="javascript:alert(1)"')
                await key('Enter')
                await wait_for('document.querySelector(".sheet .error")?.textContent.length > 0')
                self.assertEqual(await value('document.querySelectorAll(".layer").length'), 1)
                await controller.evaluate('document.querySelector("#url-input").value="abc"')
                await key('Backspace')  # edits text, does not close the dialog
                self.assertEqual(await value('document.querySelectorAll(".layer").length'), 1)
                await key('Escape')  # leaves the text field, the dialog stays
                self.assertEqual(await value('document.querySelectorAll(".layer").length'), 1)
                await key('BrowserBack')
                await wait_for('document.querySelectorAll(".layer").length === 0')
                self.assertEqual(await value(focus), 'app:browser')
                await key('Backspace')
                self.assertEqual(await value(focus), 'fav:netflix')
                # One-click launch through the real v3 API and CDP, into local fixtures
                # (user shortcuts) instead of real VOD services.
                names = ('netflix', 'max', 'prime', 'youtube')
                shortcuts = [{'id': f'fx{name}', 'name': name, 'url': f'http://127.0.0.1:8767/fixture/{name}'} for name in names]
                body = json.dumps(json.dumps({'shortcuts': shortcuts}))
                saved = await value('fetch("/api/v3/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:' + body + '}).then(r=>r.status)')
                self.assertEqual(saved, 200)
                for app_name in names:
                    await return_home()
                    await wait_for(f'!!document.querySelector(`[data-key="app:fx{app_name}"]`)')
                    self.assertEqual(await focus_key(f'app:fx{app_name}'), f'app:fx{app_name}')
                    await key('Enter')
                    await wait_for(f'document.title === "{app_name}"')
                    self.assertEqual((await controller.get_page_target())['url'], f'http://127.0.0.1:8767/fixture/{app_name}')
                # The actual Openbox shortcut returns from a page that swallows keys.
                window = subprocess.check_output(['xdotool', 'search', '--onlyvisible', '--class', 'Google-chrome'], env=env, text=True).splitlines()[-1]
                subprocess.run(['xdotool', 'windowactivate', '--sync', window], env=env, check=True)
                self.assertEqual(subprocess.check_output(['xdotool', 'getactivewindow'], env=env, text=True).strip(), window)
                # A real remote/key press has a dwell time. Avoid racing the WM
                # grab with a near-instant sequence of injected X11 modifiers.
                subprocess.run(['xdotool', 'key', '--delay', '100', '--clearmodifiers', 'ctrl+alt+h'], env=env, check=True)
                await wait_for('document.title === "Smart TV · Ekran główny"')
                self.assertEqual((await controller.get_page_target())['url'], launcher_url)
                await wait_for('document.activeElement?.dataset?.key === "fav:netflix"')
                # Launches above were recorded as recent apps by the backend.
                await wait_for('!!document.querySelector("[data-row=recent] .tile")')
                # The browser dialog opens an address through the same API.
                self.assertEqual(await focus_key('app:browser'), 'app:browser')
                await key('Enter')
                await wait_for('document.activeElement?.id === "url-input"')
                await controller.evaluate('document.querySelector("#url-input").value="http://127.0.0.1:8767/fixture/www"')
                await key('Enter')
                await wait_for('document.title === "www"')
                # Existing bearer-authenticated API invokes the real CDP CLI.
                with patch.object(rest, 'REST_BEARER_TOKEN', 'test-secret'), patch.dict(os.environ, {'CHROMIUM_DEVTOOLS_PORT': '9223'}):
                    async with TestClient(TestServer(await rest.create_app())) as client:
                        response = await client.post('/launch_url', json={'url': 'http://127.0.0.1:8767/fixture/api'}, headers={'Authorization': 'Bearer test-secret'})
                        self.assertEqual(response.status, 200)
                        self.assertTrue((await response.json())['success'])
                        await wait_for('document.title === "api"')
                await controller.close()
                await asyncio.to_thread(chrome.wait, 15)
                chrome = None
                print('PASS: 1080p launcher, HID-style keys, local navigation fixtures, authenticated API and real Openbox global shortcut')
            finally:
                failed = sys.exc_info()[0] is not None
                for process in (chrome, wm, xvfb):
                    if process is not None:
                        process.terminate()
                        try: await asyncio.to_thread(process.wait, 10)
                        except subprocess.TimeoutExpired:
                            process.kill(); process.wait()
                await runner.cleanup()
                await fixture_runner.cleanup()
                log.close()
                if failed:
                    print('Isolated Chrome/Openbox test log:', (root / 'desktop.log').read_text()[-8000:])

"""Real Chrome/CDP and REST checks without NUC hardware or account credentials."""
import asyncio
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer, make_mocked_request

import browser_ctl as browser
import chromium_watchdog as watchdog
import rest_server as rest


class ValidationTests(unittest.TestCase):
    def test_urls_and_origin(self):
        for url in ('https://www.netflix.com/', 'https://play.max.com/',
                    'https://www.primevideo.com/', 'https://open.spotify.com/',
                    'chrome://components', 'chrome://gpu', 'chrome://version'):
            self.assertTrue(browser.is_valid_url(url))
            self.assertEqual(browser.normalize_url(url), url)
        for url in ('file:///etc/passwd', 'javascript:alert(1)',
                    'chrome://quit', 'https://bad host/', 123):
            self.assertFalse(browser.is_valid_url(url))
        self.assertTrue(watchdog.is_ha_page(watchdog.HA_URL_BASE + '/lovelace/0'))
        self.assertFalse(watchdog.is_ha_page(watchdog.HA_URL_BASE + '.evil.test/'))
        self.assertFalse(watchdog.is_ha_page('https://www.netflix.com/'))
        self.assertIn('window.location.origin !== expectedOrigin', watchdog.build_auto_login_script())

    def test_nonlocal_rest_needs_token(self):
        env = {**os.environ, 'REST_IP': '0.0.0.0', 'REST_BEARER_TOKEN': ''}
        proc = subprocess.run(['python3', '-c', 'import rest_server'], env=env,
                              capture_output=True, text=True)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn('requires rest_bearer_token', proc.stdout + proc.stderr)

    def test_preferences_preserved(self):
        source = Path('haoskiosk/run.sh').read_text()
        start = source.index('seed_chromium_preferences()')
        end = source.index('\nresolve_browser_binary\n', start)
        with tempfile.TemporaryDirectory() as profile:
            script = 'BROWSER_ENGINE=chrome\nCHROMIUM_PROFILE_DIR="$1"\n' + source[start:end]
            script += '\nseed_chromium_preferences\n'
            subprocess.run(['bash', '-c', script, 'test', profile], check=True)
            prefs = Path(profile) / 'Default/Preferences'
            prefs.write_text('{"profile":{"sentinel":"preserve-me"}}')
            subprocess.run(['bash', '-c', script, 'test', profile], check=True)
            self.assertIn('preserve-me', prefs.read_text())

    def test_audio_selection_and_unavailable_server(self):
        source = Path('haoskiosk/run.sh').read_text()
        audio = source[source.index('### Set Audio sink'):source.index('### Launch Xinput parsing')]
        stub = '''
bashio::log.info() { echo "$*"; }
bashio::log.warning() { echo "$*"; }
pactl() {
    if [ "${AUDIO_SERVER_DOWN:-}" = 1 ]; then return 1; fi
    case "$1 ${2:-}" in
        "list short") printf '0 analog module s16le IDLE\\n1 usb_output module s16le IDLE\\n2 hdmi_output module s16le IDLE\\n';;
        "info ") printf 'Default Sink: analog\\n';;
        "set-default-sink "*) echo "SELECTED:$2";;
        "load-module "*) echo 10;;
    esac
}
'''
        for mode, expected in (('auto','hdmi_output'), ('hdmi','hdmi_output'),
                               ('usb','usb_output'), ('none','null')):
            proc = subprocess.run(['bash','-euo','pipefail','-c', stub + audio],
                                  env={**os.environ,'AUDIO_SINK':mode}, capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn('Setting default audio sink to: ' + expected, proc.stdout)
        proc = subprocess.run(['bash','-euo','pipefail','-c', stub + audio],
                              env={**os.environ,'AUDIO_SINK':'auto','AUDIO_SERVER_DOWN':'1'},
                              capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn('No audio sink available', proc.stdout)


class RESTTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.previous_token = rest.REST_BEARER_TOKEN
        rest.REST_BEARER_TOKEN = 'local-test-token'
        self.client = TestClient(TestServer(await rest.create_app()))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        rest.REST_BEARER_TOKEN = self.previous_token

    async def test_auth_and_browser_origin(self):
        self.assertEqual((await self.client.get('/health')).status, 200)
        self.assertEqual((await self.client.get('/current_processes')).status, 401)
        headers = {'Authorization': 'Bearer local-test-token'}
        self.assertEqual((await self.client.get('/current_processes', headers=headers)).status, 200)
        self.assertEqual((await self.client.post('/launch_url', json={'url': 'file:///etc/passwd'}, headers=headers)).status, 400)
        self.assertEqual((await self.client.post('/launch_url', json={'url': 'chrome://gpu'}, headers={**headers, 'Origin': 'https://www.netflix.com'})).status, 403)
        self.assertEqual((await self.client.post('/run_command', json={'cmd': 'cat /etc/passwd'}, headers=headers)).status, 200)
        response = await self.client.post('/run_command', json={'cmd': 'cat /etc/passwd'}, headers=headers)
        self.assertFalse((await response.json())['success'])
        with tempfile.TemporaryDirectory() as root:
            old_path = rest.DISPLAY_CONFIG_PATH
            rest.DISPLAY_CONFIG_PATH = str(Path(root) / 'slides.json')
            try:
                origin = str(self.client.make_url('/')).rstrip('/')
                response = await self.client.post('/editor/config', json={'version':1,'slides':[]},
                                                  headers={**headers, 'Origin':origin})
                self.assertEqual(response.status, 200)
                self.assertTrue((await response.json())['success'])
            finally:
                rest.DISPLAY_CONFIG_PATH = old_path

    async def test_forwarded_header_does_not_grant_local_access(self):
        class Transport:
            def get_extra_info(self, name, default=None):
                return ('192.0.2.1', 54321) if name == 'peername' else default
        async def handler(request):
            return web.json_response({'success': True})
        handler.cmd_name = 'launch_url'
        rest.REST_BEARER_TOKEN = None
        request = make_mocked_request('POST', '/launch_url',
                                      headers={'X-Forwarded-For': '127.0.0.1'}, transport=Transport())
        self.assertEqual((await rest.security_middleware(request, handler)).status, 403)


class ChromeTests(unittest.IsolatedAsyncioTestCase):
    async def test_x11_cdp_profile_restart_and_eme(self):
        with tempfile.TemporaryDirectory() as root:
            profile = Path(root) / 'profile'
            xlog = open(Path(root) / 'xvfb.log', 'w')
            xvfb = subprocess.Popen(['Xvfb', ':99', '-screen', '0', '1280x720x24', '-nolisten', 'tcp'], stdout=xlog, stderr=xlog)
            chrome = None
            runner = web.AppRunner(web.Application())
            runner.app.router.add_get('/', lambda _: web.Response(text='<html><title>Kiosk test</title></html>', content_type='text/html'))
            runner.app.router.add_get('/next', lambda _: web.Response(text='<html><title>Next</title></html>', content_type='text/html'))
            await runner.setup()
            site = web.TCPSite(runner, '127.0.0.1', 8765)
            await site.start()
            controller = browser.ChromiumController(port=9222)
            try:
                for _ in range(40):
                    if Path('/tmp/.X11-unix/X99').exists():
                        break
                    await asyncio.sleep(0.1)
                for iteration in range(2):
                    with open(Path(root) / 'chrome.log', 'a') as clog:
                        # Resolve the actual production flags, using the exact run.sh function.
                        source = Path('haoskiosk/run.sh').read_text()
                        start = source.index('resolve_browser_binary()')
                        end = source.index('\nbrowser_process_running()', start)
                        script = 'BROWSER_ENGINE=chrome\nCHROMIUM_DEVTOOLS_PORT=9222\nCHROMIUM_PROFILE_DIR="$1"\n'
                        script += source[start:end] + '\nresolve_browser_binary\nexec "$BROWSER" "${BROWSER_FLAGS[@]}" http://127.0.0.1:8765/\n'
                        chrome = subprocess.Popen(['bash', '-c', script, 'test', str(profile)],
                                                  env={**os.environ, 'DISPLAY': ':99'}, stdout=clog, stderr=clog)
                    for _ in range(100):
                        try:
                            await controller.get_page_target()
                            break
                        except Exception:
                            await asyncio.sleep(0.1)
                    else:
                        self.fail('Chrome did not start: ' + Path(root, 'chrome.log').read_text())
                    self.assertEqual((await controller.get_page_target())['url'], 'http://127.0.0.1:8765/')
                    # Observe the actual listening address, not just the command line flag.
                    lines = subprocess.check_output(['ss', '-ltn'], text=True).splitlines()
                    listeners = [line.split()[3] for line in lines if ':9222 ' in line]
                    self.assertTrue(listeners)
                    self.assertTrue(all(addr in {'127.0.0.1:9222', '[::1]:9222'} for addr in listeners), listeners)
                    if iteration == 0:
                        await controller.evaluate("localStorage.setItem('kiosk-test','retained'); document.cookie='kiosk_test=retained; Max-Age=3600; path=/'")
                        await controller.navigate('http://127.0.0.1:8765/next')
                        await controller.reload()
                        await asyncio.sleep(0.2)
                        self.assertEqual((await controller.get_page_target())['url'], 'http://127.0.0.1:8765/next')
                        eme = await controller.evaluate("navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{initDataTypes:['cenc'],videoCapabilities:[{contentType:'video/mp4; codecs=\"avc1.42E01E\"'}]}]).then(()=>'available').catch(e=>e.name)", await_promise=True)
                        status = watchdog.extract_evaluate_value(eme)
                        print('Widevine EME negotiation in virtual X11:', status)
                        self.assertEqual(status, 'available')
                    else:
                        result = await controller.evaluate("({storage:localStorage.getItem('kiosk-test'),cookie:document.cookie})")
                        value = watchdog.extract_evaluate_value(result)
                        self.assertEqual(value['storage'], 'retained')
                        self.assertIn('kiosk_test=retained', value['cookie'])
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
                await runner.cleanup()
                xvfb.terminate()
                xvfb.wait(timeout=10)
                xlog.close()

"""Development harness: real v3 HTTP API/storage, explicit simulated TV/CDP/X only.

Run from the repository root with Python + aiohttp. Never deploy this harness.
"""
import argparse
import asyncio
import os
from pathlib import Path
import sys
import tempfile
import ssl

parser = argparse.ArgumentParser()
parser.add_argument("--assets", type=Path, help="haoskiosk assets directory (e.g. frontend worktree)")
parser.add_argument("--port", type=int, default=8080)
parser.add_argument("--mock-adapters", action="store_true", help="Explicitly replace hardware adapters with test fixtures")
parser.add_argument("--db", type=Path)
parser.add_argument("--remote-port", type=int)
parser.add_argument("--cert", type=Path)
parser.add_argument("--key", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "haoskiosk"))
os.environ["REST_PORT"] = str(args.port)
os.environ["SMART_TV_DB"] = str(args.db or Path(tempfile.mkdtemp(prefix="smart-tv-dev-")) / "state.sqlite3")
import rest_server
import smart_tv

if args.assets:
    smart_tv.ROOT = args.assets.resolve()
    rest_server.LAUNCHER_DIR = args.assets.resolve() / "launcher"

async def main():
    app = await rest_server.create_app()
    if args.mock_adapters:
        sys.path.insert(0, str(root / "tests"))
        from test_smart_tv import FakeBrowser, FakeHA
        from unittest.mock import AsyncMock
        service = app["smart_tv"]
        service.ha, service.browser = FakeHA(), FakeBrowser()
        service.xinput = AsyncMock()
        print("DEVELOPMENT: HA, Chrome and X input are simulated; API/auth/storage are real", flush=True)
    runner = rest_server.web.AppRunner(app, access_log=None)
    await runner.setup()
    await rest_server.web.TCPSite(runner, "127.0.0.1", args.port).start()
    print(f"Development TV: http://127.0.0.1:{args.port}/launcher", flush=True)
    remote_runner = None
    if args.remote_port:
        if not args.cert or not args.key:
            raise ValueError("Development HTTPS requires --cert and --key; never falls back to HTTP")
        service = app["smart_tv"]
        service.remote_origin = f"https://127.0.0.1:{args.remote_port}"
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(args.cert, args.key)
        remote_runner = rest_server.web.AppRunner(service.remote_app(), access_log=None)
        await remote_runner.setup()
        await rest_server.web.TCPSite(remote_runner, "127.0.0.1", args.remote_port, ssl_context=context).start()
        service.remote_enabled = True
        print(f"Development remote: {service.remote_origin}/remote/", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        if remote_runner:
            await remote_runner.cleanup()
        await runner.cleanup()

asyncio.run(main())

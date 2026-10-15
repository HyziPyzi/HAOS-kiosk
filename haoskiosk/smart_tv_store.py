"""Small transactional store. Session secrets are never persisted, only SHA256 hashes."""
from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time

DEFAULT_SETTINGS = {
    "safe_area": 0, "accent": "#f0b35b", "animation": "full", "night_mode": False,
    "wallpaper": "dusk", "touchpad_speed": 1.0, "tv_entity": "", "tv_source": "",
    "weather_entity": "", "entities": [], "movie_scene": "", "movie_lights": [],
    "movie_brightness": 20, "movie_app": "netflix", "movie_volume": None,
    "shortcuts": [], "assist_enabled": False,
}
DEFAULT_PROFILE = {"id": "default", "name": "Dom", "avatar": "a1",
                   "favorites": ["netflix", "max", "prime", "youtube"],
                   "app_order": ["netflix", "max", "prime", "youtube", "spotify", "home_assistant", "browser"],
                   "preferences": {}}


class Store:
    """Single event-loop connection, bounded documents, atomic SQLite commits."""

    def __init__(self, path: str | Path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(str(path))
        os.chmod(path, 0o600)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            PRAGMA journal_mode=DELETE;
            CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS devices(
                id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
                created_at REAL NOT NULL, expires_at REAL NOT NULL);
        """)
        self.db.commit()

    def get(self, key, default=None):
        row = self.db.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else copy.deepcopy(default)

    def put(self, key, value):
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO kv VALUES (?,?)", (key, json.dumps(value, ensure_ascii=False)))

    def settings(self):
        return {**DEFAULT_SETTINGS, **self.get("settings", {})}

    def profiles(self):
        return self.get("profiles", [DEFAULT_PROFILE])

    @staticmethod
    def digest(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def add_device(self, name):
        now = time.time()
        with self.db:
            self.db.execute("DELETE FROM devices WHERE expires_at<=?", (now,))
            if self.db.execute("SELECT count(*) FROM devices").fetchone()[0] >= 30:
                raise ValueError("Device limit reached; revoke an existing device at the TV")
            token = secrets.token_urlsafe(32)
            device = {"id": secrets.token_hex(12), "name": name, "created_at": now,
                      "expires_at": now + 30 * 86400}
            self.db.execute("INSERT INTO devices VALUES (?,?,?,?,?)", (
                device["id"], name, self.digest(token), now, device["expires_at"]))
        return device, token

    def authenticate(self, token):
        if not token or len(token) > 128:
            return None
        row = self.db.execute("SELECT id,name,created_at,expires_at FROM devices WHERE token_hash=? AND expires_at>?",
                              (self.digest(token), time.time())).fetchone()
        return dict(row) if row else None

    def devices(self):
        return [dict(row) for row in self.db.execute(
            "SELECT id,name,created_at,expires_at FROM devices WHERE expires_at>? ORDER BY created_at", (time.time(),))]

    def revoke(self, device_id):
        with self.db:
            self.db.execute("DELETE FROM devices WHERE id=?", (device_id,))

    def close(self):
        self.db.close()

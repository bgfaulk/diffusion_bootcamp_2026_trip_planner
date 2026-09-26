#!/usr/bin/env python3
import cgi
import json
import mimetypes
import os
import shutil
import signal
import socket
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

APP_ROOT = Path(__file__).resolve().parent
PUBLIC_ROOT = APP_ROOT / "public"
DATA_DIR = APP_ROOT / "data"
DB_PATH = DATA_DIR / "trip_planner.sqlite3"
HOST = "0.0.0.0"
PORT = int(os.environ.get("TRIP_PLANNER_PORT", "8767"))

STARTER_ITEMS = {
    "prechecks": [
        "Confirm traveler names match government IDs",
        "Add TSA PreCheck or Known Traveler Numbers if available",
        "Download airline, hotel, and rental car apps",
        "Save reservations for offline access",
        "Confirm training address and daily start time",
        "Check weather and adjust packing layers",
    ],
    "packing": [
        "Government ID and wallet",
        "Phone, charger, and portable battery",
        "Laptop, charger, notebook, and pens",
        "Comfortable walking shoes",
        "Light jacket for cool Bay Area evenings",
        "Toiletries and medications",
    ],
    "departure": [
        "Check flight status before leaving",
        "Download boarding passes",
        "Pack IDs and medication in personal item",
        "Do home sweep: lights, locks, thermostat, trash",
        "Leave enough time for airport parking/security",
    ],
    "explore": [
        "Save Google Maps links for daytime ideas",
        "Pick one easy dinner close to the hotel",
        "Plan one classic San Francisco viewpoint",
        "Keep layers handy for windy evenings",
    ],
    "return": [
        "Check out on time",
        "Room sweep: chargers, closet, bathroom, safe",
        "Refuel rental car if required",
        "Save receipts for expenses",
        "Check return flight status",
    ],
}

PHOTO_SPOTS = [
    ("golden-gate-overlook", "Golden Gate Overlook", "Langdon Ct, San Francisco, CA"),
    ("ferry-building", "Ferry Building", "1 Ferry Building, San Francisco, CA"),
    ("north-beach", "North Beach", "Washington Square / Columbus Ave, San Francisco, CA"),
    ("mission-district", "Mission District", "Dolores Park anchor, San Francisco, CA"),
    ("half-moon-bay", "Half Moon Bay", "Main Street / Coastside, Half Moon Bay, CA"),
    ("filoli", "Filoli", "86 Cañada Rd, Woodside, CA"),
    ("training-campus", "Training campus", "Add your training location in settings"),
    ("hotel-base", "Hotel base", "Add your hotel in settings"),
    ("wildcard", "Favorite surprise", "A funny, pretty, or unexpected moment"),
]


def local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def connect():
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS list_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page TEXT NOT NULL,
            title TEXT NOT NULL,
            checked INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            spot TEXT NOT NULL,
            caption TEXT,
            filename TEXT,
            content_type TEXT NOT NULL,
            image BLOB NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    seed_items(conn)
    return conn


def seed_items(conn):
    count = conn.execute("SELECT COUNT(*) AS count FROM list_items").fetchone()["count"]
    if count:
        return
    for page, items in STARTER_ITEMS.items():
        for position, title in enumerate(items, start=1):
            conn.execute(
                "INSERT INTO list_items (page, title, position) VALUES (?, ?, ?)",
                (page, title, position),
            )


def json_response(handler, payload, status=200):
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    server_version = "LocalTripPlanner/1.0"

    def log_message(self, fmt, *args):
        print("%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/bootstrap":
            with connect() as conn:
                settings = {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM settings")}
                rows = conn.execute(
                    "SELECT * FROM list_items ORDER BY checked ASC, position ASC, id ASC"
                ).fetchall()
                photos = latest_photos(conn)
            json_response(self, {
                "settings": settings,
                "items": [dict(row) for row in rows],
                "photos": photos,
                "spots": [{"id": s[0], "title": s[1], "hint": s[2]} for s in PHOTO_SPOTS],
                "phoneUrl": f"http://{local_ip()}:{PORT}",
            })
            return
        if path.startswith("/api/photos/") and path.endswith("/image"):
            parts = path.strip("/").split("/")
            if len(parts) == 4:
                try:
                    photo_id = int(parts[2])
                except ValueError:
                    self.send_error(404)
                    return
                with connect() as conn:
                    row = conn.execute("SELECT image, content_type FROM photos WHERE id = ?", (photo_id,)).fetchone()
                if not row:
                    self.send_error(404)
                    return
                body = row["image"]
                self.send_response(200)
                self.send_header("Content-Type", row["content_type"])
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "private, max-age=300")
                self.end_headers()
                self.wfile.write(body)
                return
        self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/settings":
            payload = self.read_json()
            allowed = {
                "profileName", "tripName", "homeBase", "trainingLocation",
                "primaryColor", "phoneAccess", "keepAwake"
            }
            with connect() as conn:
                for key, value in payload.items():
                    if key in allowed:
                        conn.execute(
                            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                            (key, str(value)),
                        )
            json_response(self, {"ok": True})
            return
        if path == "/api/items":
            payload = self.read_json()
            page = str(payload.get("page", "")).strip()
            title = str(payload.get("title", "")).strip()
            if page not in STARTER_ITEMS or not title:
                json_response(self, {"error": "Missing page or title"}, 400)
                return
            with connect() as conn:
                position = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM list_items WHERE page = ?", (page,)).fetchone()["p"]
                cur = conn.execute("INSERT INTO list_items (page, title, position) VALUES (?, ?, ?)", (page, title, position))
                row = conn.execute("SELECT * FROM list_items WHERE id = ?", (cur.lastrowid,)).fetchone()
            json_response(self, {"item": dict(row)})
            return
        if path.startswith("/api/items/"):
            parts = path.strip("/").split("/")
            if len(parts) >= 3:
                try:
                    item_id = int(parts[2])
                except ValueError:
                    json_response(self, {"error": "Bad item id"}, 400)
                    return
                if len(parts) == 4 and parts[3] == "toggle":
                    payload = self.read_json()
                    checked = 1 if payload.get("checked") else 0
                    with connect() as conn:
                        row = conn.execute("SELECT page FROM list_items WHERE id = ?", (item_id,)).fetchone()
                        if not row:
                            json_response(self, {"error": "Not found"}, 404)
                            return
                        max_position = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM list_items WHERE page = ?", (row["page"],)).fetchone()["p"]
                        conn.execute("UPDATE list_items SET checked = ?, position = ? WHERE id = ?", (checked, max_position, item_id))
                    json_response(self, {"ok": True})
                    return
                if len(parts) == 3:
                    with connect() as conn:
                        conn.execute("DELETE FROM list_items WHERE id = ?", (item_id,))
                    json_response(self, {"ok": True})
                    return
        if path == "/api/photos":
            self.handle_photo_upload()
            return
        if path == "/api/teardown":
            payload = self.read_json()
            if payload.get("confirmData") != "DELETE MY LOCAL DATA" or payload.get("confirmRepo") != "REMOVE LOCAL APP":
                json_response(self, {"error": "Confirmation text did not match"}, 400)
                return
            json_response(self, {"ok": True, "message": "Teardown scheduled"})
            threading.Thread(target=teardown_app, daemon=True).start()
            return
        self.send_error(404)

    def handle_photo_upload(self):
        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
            },
        )
        spot = (form.getfirst("spot") or "").strip()
        caption = (form.getfirst("caption") or "").strip()
        photo = form["photo"] if "photo" in form else None
        valid_spots = {spot_id for spot_id, _, _ in PHOTO_SPOTS}
        if spot not in valid_spots or photo is None or not getattr(photo, "file", None):
            json_response(self, {"error": "Missing spot or photo"}, 400)
            return
        image = photo.file.read()
        content_type = photo.type or "application/octet-stream"
        if not image or not content_type.startswith("image/") or len(image) > 15 * 1024 * 1024:
            json_response(self, {"error": "Invalid image"}, 400)
            return
        with connect() as conn:
            cur = conn.execute(
                "INSERT INTO photos (spot, caption, filename, content_type, image) VALUES (?, ?, ?, ?, ?)",
                (spot, caption, os.path.basename(photo.filename or "photo"), content_type, image),
            )
        json_response(self, {"ok": True, "id": cur.lastrowid})

    def do_DELETE(self):
        self.do_POST()

    def serve_static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        target = (PUBLIC_ROOT / Path(unquote(path.lstrip("/")))).resolve()
        if not str(target).startswith(str(PUBLIC_ROOT.resolve())) or not target.is_file():
            self.send_error(404)
            return
        body = target.read_bytes()
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store" if content_type in {"text/html", "text/css", "application/javascript"} else "private, max-age=300")
        self.end_headers()
        self.wfile.write(body)


def latest_photos(conn):
    rows = conn.execute("""
        SELECT p.id, p.spot, p.caption, p.filename, p.content_type, p.created_at
        FROM photos p
        JOIN (
            SELECT spot, MAX(id) AS max_id
            FROM photos
            GROUP BY spot
        ) latest ON latest.max_id = p.id
    """).fetchall()
    return {
        row["spot"]: {
            "id": row["id"],
            "caption": row["caption"],
            "filename": row["filename"],
            "contentType": row["content_type"],
            "createdAt": row["created_at"],
            "imageUrl": f"/api/photos/{row['id']}/image",
        }
        for row in rows
    }


def teardown_app():
    time.sleep(1.5)
    try:
        if DB_PATH.exists():
            DB_PATH.unlink()
        marker = APP_ROOT.with_name(APP_ROOT.name + "_removed")
        if marker.exists():
            shutil.rmtree(marker)
        shutil.move(str(APP_ROOT), str(marker))
    finally:
        os.kill(os.getpid(), signal.SIGTERM)


if __name__ == "__main__":
    with connect():
        pass
    ip = local_ip()
    print(f"Local Trip Planner running:")
    print(f"  Computer: http://localhost:{PORT}")
    print(f"  Phone on same Wi-Fi: http://{ip}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()

"""Local-first Flic boundary. Hardware SDK callbacks call handle_event()."""
import json
import sqlite3
import time
import uuid
from pathlib import Path
from urllib import request

DEFAULT_MAPPING = {"single:A":"POINT_A", "single:B":"POINT_B", "double:A":"UNDO", "double:B":"UNDO", "hold:A":"MARK_HIGHLIGHT", "hold:B":"MARK_HIGHLIGHT"}


class FlicAdapter:
    def __init__(self, court_path, controller_token, device_id="flic-gateway", mapping=None, queue_path="/opt/tennislive-score/data/flic_queue.db", api_origin="http://127.0.0.1:8010"):
        self.court_path, self.token, self.device_id = court_path.strip("/"), controller_token, device_id
        self.mapping, self.api_origin = {**DEFAULT_MAPPING, **(mapping or {})}, api_origin.rstrip("/")
        self.db = sqlite3.connect(queue_path)
        self.db.execute("CREATE TABLE IF NOT EXISTS queue(event_id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT)")
        self.db.commit()

    def normalize(self, button_id, assigned_side, gesture, label=None):
        side, gesture = assigned_side.upper(), gesture.lower()
        action = self.mapping.get(f"{gesture}:{side}")
        if not action: raise ValueError("No Flic mapping for event")
        return {"action":action,"eventId":f"flic:{button_id}:{uuid.uuid4().hex}","source":"flic","deviceId":button_id,"label":label or ""}

    def handle_event(self, button_id, assigned_side, gesture, label=None):
        payload = self.normalize(button_id, assigned_side, gesture, label)
        self.db.execute("INSERT OR IGNORE INTO queue(event_id,payload,created_at) VALUES(?,?,?)", (payload["eventId"], json.dumps(payload), int(time.time()*1000)))
        self.db.commit(); self.flush(); return payload

    def flush(self):
        for event_id, raw in self.db.execute("SELECT event_id,payload FROM queue ORDER BY created_at LIMIT 100").fetchall():
            try:
                req=request.Request(f"{self.api_origin}/api/score-actions/{self.court_path}", data=raw.encode(), method="POST", headers={"Content-Type":"application/json","X-Controller-Token":self.token})
                with request.urlopen(req, timeout=5) as response:
                    if response.status >= 300: raise RuntimeError(f"HTTP {response.status}")
                self.db.execute("DELETE FROM queue WHERE event_id=?", (event_id,))
            except Exception as error:
                self.db.execute("UPDATE queue SET attempts=attempts+1,last_error=? WHERE event_id=?", (str(error)[:300],event_id))
                break
        self.db.commit()

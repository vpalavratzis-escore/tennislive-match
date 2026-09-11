import hashlib
import hmac
import json
import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Body, Header, HTTPException

from state_store import StateStore


VALID_ACTIONS = {
    "POINT_A", "POINT_B", "UNDO", "START_MATCH", "END_MATCH",
    "ABORT_MATCH", "MARK_HIGHLIGHT", "CHANGE_SERVER",
}
POINTS = ["0", "15", "30", "40"]


class ScoreActionService:
    def __init__(self, data_dir="/opt/tennislive-score/data"):
        self.data_dir = Path(data_dir)
        self.db_path = self.data_dir / "score_actions.db"
        self.state = StateStore(str(self.data_dir / "state.json"))
        self.secret = self._read_secret()
        self._init_db()

    def _read_secret(self):
        for path in ("/etc/tennislive/api_key.txt", "/opt/tennislive-score/api_key.txt"):
            try:
                value = Path(path).read_text().strip()
                if value:
                    return value.encode()
            except OSError:
                pass
        raise RuntimeError("ScoreAction signing secret is unavailable")

    def _connect(self):
        db = sqlite3.connect(self.db_path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def _init_db(self):
        self.data_dir.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.executescript("""
              CREATE TABLE IF NOT EXISTS score_actions (
                action_id TEXT PRIMARY KEY, event_key TEXT UNIQUE NOT NULL,
                court_id TEXT NOT NULL, match_id TEXT, action TEXT NOT NULL,
                source TEXT NOT NULL, device_id TEXT NOT NULL,
                sequence INTEGER NOT NULL, server_timestamp INTEGER NOT NULL,
                label TEXT, score_before TEXT, score_after TEXT
              );
              CREATE TABLE IF NOT EXISTS controller_sessions (
                token_hash TEXT PRIMARY KEY, court_id TEXT NOT NULL,
                expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
              );
              CREATE INDEX IF NOT EXISTS idx_actions_court_seq
                ON score_actions(court_id, sequence);
            """)

    def create_session(self, court_id, api_key):
        if not hmac.compare_digest(api_key or "", self.secret.decode()):
            raise HTTPException(401, "Invalid controller credential")
        now = int(time.time())
        nonce = uuid.uuid4().hex
        token = f"{now}.{nonce}." + hmac.new(
            self.secret, f"{court_id}:{now}:{nonce}".encode(), hashlib.sha256
        ).hexdigest()
        with self._connect() as db:
            db.execute(
                "INSERT INTO controller_sessions VALUES (?,?,?,?)",
                (hashlib.sha256(token.encode()).hexdigest(), court_id, now + 8 * 3600, now),
            )
        return token, now + 8 * 3600

    def require_session(self, token, court_id):
        digest = hashlib.sha256((token or "").encode()).hexdigest()
        with self._connect() as db:
            row = db.execute(
                "SELECT court_id,expires_at FROM controller_sessions WHERE token_hash=?",
                (digest,),
            ).fetchone()
        if not row or row["court_id"] != court_id or row["expires_at"] < int(time.time()):
            raise HTTPException(401, "Controller session expired or invalid")

    @staticmethod
    def _snapshot(state):
        return {k: state.get(k) for k in (
            "pointA", "pointB", "gamesA", "gamesB", "setsA", "setsB",
            "server", "matchStatus", "matchId", "nameA", "nameB", "sport"
        )}

    @staticmethod
    def _win_point(state, side):
        other = "B" if side == "A" else "A"
        own_key, other_key = f"point{side}", f"point{other}"
        own, rival = str(state.get(own_key, "0")).upper(), str(state.get(other_key, "0")).upper()
        if own == "AD":
            ScoreActionService._win_game(state, side)
        elif rival == "AD":
            state[other_key] = "40"
        elif own == "40" and rival == "40":
            state[own_key] = "AD"
        elif own == "40":
            ScoreActionService._win_game(state, side)
        else:
            state[own_key] = POINTS[min(3, POINTS.index(own) + 1)] if own in POINTS else "15"

    @staticmethod
    def _win_game(state, side):
        other = "B" if side == "A" else "A"
        state[f"games{side}"] = int(state.get(f"games{side}", 0)) + 1
        state["pointA"] = state["pointB"] = "0"
        a, b = int(state.get("gamesA", 0)), int(state.get("gamesB", 0))
        if (a >= 6 or b >= 6) and abs(a - b) >= 2:
            winner = "A" if a > b else "B"
            state[f"sets{winner}"] = int(state.get(f"sets{winner}", 0)) + 1
            state["gamesA"] = state["gamesB"] = 0
        state["server"] = other if state.get("server", "A") == side else side

    def apply(self, court_id, payload):
        action = str(payload.get("action") or "").upper()
        if action not in VALID_ACTIONS:
            raise HTTPException(422, "Unsupported ScoreAction")
        source = str(payload.get("source") or "web").lower()[:32]
        device_id = str(payload.get("deviceId") or "unknown")[:128]
        client_event_id = str(payload.get("eventId") or payload.get("actionId") or "").strip()
        if not client_event_id:
            raise HTTPException(422, "eventId is required for idempotency")
        event_key = hashlib.sha256(f"{source}:{device_id}:{client_event_id}".encode()).hexdigest()
        now = int(time.time() * 1000)
        with self._connect() as db:
            existing = db.execute("SELECT * FROM score_actions WHERE event_key=?", (event_key,)).fetchone()
            if existing:
                return {"ok": True, "duplicate": True, "actionId": existing["action_id"], "sequence": existing["sequence"], "state": json.loads(existing["score_after"] or "{}")}
            state = self.state.get(court_id) or {"nameA":"Player A","nameB":"Player B","pointA":"0","pointB":"0","gamesA":0,"gamesB":0,"setsA":0,"setsB":0,"server":"A"}
            before = self._snapshot(state)
            if action in ("POINT_A", "POINT_B"):
                if str(state.get("matchStatus") or "").upper() not in ("LIVE", "PLAYING", "IN_PROGRESS"):
                    raise HTTPException(409, "Start the match before scoring")
                self._win_point(state, action[-1])
            elif action == "CHANGE_SERVER": state["server"] = "B" if state.get("server") == "A" else "A"
            elif action == "START_MATCH": state.update({"matchStatus":"LIVE", "matchId": state.get("matchId") or f"match_{uuid.uuid4().hex}"})
            elif action == "END_MATCH": state["matchStatus"] = "ENDED"
            elif action == "ABORT_MATCH": state["matchStatus"] = "ABORTED"
            elif action == "UNDO":
                previous = db.execute("SELECT score_before FROM score_actions WHERE court_id=? AND action IN ('POINT_A','POINT_B') ORDER BY sequence DESC LIMIT 1", (court_id,)).fetchone()
                if not previous: raise HTTPException(409, "Nothing to undo")
                state.update(json.loads(previous["score_before"]))
            state["updatedAt"] = now
            saved = self.state.set(court_id, state)
            sequence = db.execute("SELECT COALESCE(MAX(sequence),0)+1 FROM score_actions WHERE court_id=?", (court_id,)).fetchone()[0]
            action_id = f"act_{uuid.uuid4().hex}"
            db.execute("INSERT INTO score_actions VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
                action_id, event_key, court_id, saved.get("matchId"), action, source,
                device_id, sequence, now, str(payload.get("label") or "")[:160],
                json.dumps(before), json.dumps(self._snapshot(saved)),
            ))
        return {"ok": True, "duplicate": False, "actionId": action_id, "sequence": sequence, "serverTimestamp": now, "source": source, "deviceId": device_id, "courtId": court_id, "matchId": saved.get("matchId"), "state": saved}


def mount_score_actions(app):
    service = ScoreActionService()
    router = APIRouter()

    @router.post("/api/controller/session/{country}/{city}/{club}/{court}")
    def controller_session(country: str, city: str, club: str, court: str, x_api_key: str = Header(default="")):
        court_id = f"{country}/{city}/{club}/{court}"
        token, expires = service.create_session(court_id, x_api_key)
        return {"ok": True, "token": token, "courtId": court_id, "expiresAt": expires * 1000}

    @router.post("/api/score-actions/{country}/{city}/{club}/{court}")
    def score_action(country: str, city: str, club: str, court: str, payload: Dict[str, Any] = Body(...), x_controller_token: str = Header(default="")):
        court_id = f"{country}/{city}/{club}/{court}"
        service.require_session(x_controller_token, court_id)
        return service.apply(court_id, payload)

    app.include_router(router)

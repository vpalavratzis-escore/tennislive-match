import json
import os
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional


_HISTORY_LOCK = threading.Lock()


# ===== VC ARCHIVE MEDIA SNAPSHOT V1 START =====

_VC_ARCHIVE_RETENTION_DAYS = 30

_VC_ARCHIVE_RETENTION_MS = (
    _VC_ARCHIVE_RETENTION_DAYS
    * 24 * 60 * 60 * 1000
)

_VC_MEDIA_DIR = '/var/www/tennislive/media'

_VC_PHOTO_STAGING_DIR = os.path.join(
    _VC_MEDIA_DIR,
    ".match-staging"
)

_VC_ARCHIVE_MEDIA_DIR = os.path.join(
    _VC_MEDIA_DIR,
    "match-archive"
)

_VC_PUBLIC_MEDIA_BASE = (
    'https://api.escoreboards.eu'.rstrip("/")
    + "/media"
)


def _vc_safe_file_id(value: str) -> str:
    import re

    value = str(value or "").strip()

    return re.sub(
        r"[^A-Za-z0-9_.-]+",
        "_",
        value
    )


def _vc_snapshot_match_photos(
    data: Dict[str, Any]
) -> None:

    import shutil

    match_id = _vc_safe_file_id(
        data.get("matchId")
    )

    court_id = str(
        data.get("courtId")
        or ""
    ).strip()

    court_slug = (
        court_id
        .rstrip("/")
        .split("/")[-1]
    )

    if not match_id or not court_slug:
        return

    destination_dir = os.path.join(
        _VC_ARCHIVE_MEDIA_DIR,
        match_id
    )

    os.makedirs(
        destination_dir,
        exist_ok=True
    )

    for side in ("A", "B"):

        source = None
        source_ext = None

        for ext in (".jpg", ".png"):

            candidate = os.path.join(
                _VC_PHOTO_STAGING_DIR,
                f"{court_slug}_{side}{ext}"
            )

            if os.path.isfile(candidate):
                source = candidate
                source_ext = ext
                break

        if not source:
            continue

        filename = (
            f"player{side}{source_ext}"
        )

        destination = os.path.join(
            destination_dir,
            filename
        )

        try:
            shutil.copy2(
                source,
                destination
            )

            data[f"photo{side}"] = (
                f"{_VC_PUBLIC_MEDIA_BASE}/"
                f"match-archive/"
                f"{match_id}/"
                f"{filename}"
            )

        except Exception as error:
            print(
                "ARCHIVE PHOTO SNAPSHOT ERROR:",
                side,
                error
            )

# ===== VC ARCHIVE MEDIA SNAPSHOT V1 END =====


class MatchHistoryStore:
    """
    30-day rolling archive of VoxCourt matches.

    The live MatchStore keeps the current/latest match per court.
    This store keeps archived matches by matchId until retention cleanup.
    """

    def __init__(self, filepath: str):
        self.filepath = filepath
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            self.filepath,
            timeout=10.0,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout = 10000")
        return conn

    def _init_db(self) -> None:
        with _HISTORY_LOCK:
            conn = self._connect()
            try:
                conn.execute("PRAGMA journal_mode = WAL")
                conn.execute("PRAGMA synchronous = NORMAL")

                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS match_history (
                        match_id TEXT PRIMARY KEY,
                        court_id TEXT NOT NULL,
                        archive_status TEXT NOT NULL,
                        started_at INTEGER,
                        ended_at INTEGER,
                        archived_at INTEGER NOT NULL,
                        payload_json TEXT NOT NULL
                    )
                    """
                )

                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS
                    idx_match_history_ended_at
                    ON match_history(ended_at DESC)
                    """
                )

                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS
                    idx_match_history_court_ended
                    ON match_history(court_id, ended_at DESC)
                    """
                )

                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS
                    idx_match_history_status_ended
                    ON match_history(archive_status, ended_at DESC)
                    """
                )

                conn.commit()
            finally:
                conn.close()

    @staticmethod
    def _decode_row(
        row: sqlite3.Row,
        include_events: bool = False,
    ) -> Dict[str, Any]:
        try:
            payload = json.loads(row["payload_json"])
        except Exception:
            payload = {}

        if not isinstance(payload, dict):
            payload = {}

        payload["matchId"] = row["match_id"]
        payload["courtId"] = row["court_id"]
        payload["archiveStatus"] = row["archive_status"]
        payload["archivedAt"] = row["archived_at"]

        if not include_events:
            payload.pop("events", None)

        return payload

    def archive(
        self,
        match: Dict[str, Any],
        archive_status: Optional[str] = None,
    ) -> Dict[str, Any]:
        data = dict(match or {})

        match_id = str(data.get("matchId") or "").strip()
        court_id = str(data.get("courtId") or "").strip()

        if not match_id:
            raise ValueError("matchId is required")

        if not court_id:
            raise ValueError("courtId is required")

        status = str(
            archive_status
            or data.get("archiveStatus")
            or data.get("status")
            or "ENDED"
        ).strip().upper()

        started_at = data.get("startedAt")
        ended_at = data.get("endedAt")
        archived_at = int(time.time() * 1000)

        data["matchId"] = match_id
        data["courtId"] = court_id
        data["archiveStatus"] = status
        data["archivedAt"] = archived_at

        # ===== VC ARCHIVE SNAPSHOT CALL V1 START =====

        data["retentionDays"] = (
            _VC_ARCHIVE_RETENTION_DAYS
        )

        data["expiresAt"] = (
            archived_at
            + _VC_ARCHIVE_RETENTION_MS
        )

        _vc_snapshot_match_photos(
            data
        )

        # ===== VC ARCHIVE SNAPSHOT CALL V1 END =====

        payload_json = json.dumps(
            data,
            ensure_ascii=False,
            separators=(",", ":"),
        )

        with _HISTORY_LOCK:
            conn = self._connect()

            try:
                conn.execute(
                    """
                    INSERT INTO match_history (
                        match_id,
                        court_id,
                        archive_status,
                        started_at,
                        ended_at,
                        archived_at,
                        payload_json
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)

                    ON CONFLICT(match_id) DO UPDATE SET
                        court_id = excluded.court_id,
                        archive_status = excluded.archive_status,
                        started_at = excluded.started_at,
                        ended_at = excluded.ended_at,
                        archived_at = excluded.archived_at,
                        payload_json = excluded.payload_json
                    """,
                    (
                        match_id,
                        court_id,
                        status,
                        started_at,
                        ended_at,
                        archived_at,
                        payload_json,
                    ),
                )

                conn.commit()
            finally:
                conn.close()

        return dict(data)

    def get(self, match_id: str) -> Optional[Dict[str, Any]]:
        match_id = str(match_id or "").strip()

        if not match_id:
            return None

        conn = self._connect()

        try:
            row = conn.execute(
                """
                SELECT *
                FROM match_history
                WHERE match_id = ?
                """,
                (match_id,),
            ).fetchone()
        finally:
            conn.close()

        if row is None:
            return None

        return self._decode_row(
            row,
            include_events=True,
        )

    def list_recent(
        self,
        limit: int = 100,
        court_id: str = "",
        archive_status: str = "",
    ) -> List[Dict[str, Any]]:
        limit = max(1, min(int(limit), 1000))

        conditions = []
        params: List[Any] = []

        court_id = str(court_id or "").strip()
        archive_status = str(archive_status or "").strip().upper()

        if court_id:
            conditions.append("court_id = ?")
            params.append(court_id)

        if archive_status:
            conditions.append("archive_status = ?")
            params.append(archive_status)

        where_sql = ""

        if conditions:
            where_sql = " WHERE " + " AND ".join(conditions)

        sql = (
            "SELECT * "
            "FROM match_history"
            + where_sql
            + " ORDER BY COALESCE(ended_at, started_at, archived_at) DESC "
            "LIMIT ?"
        )

        params.append(limit)

        conn = self._connect()

        try:
            rows = conn.execute(
                sql,
                params,
            ).fetchall()
        finally:
            conn.close()

        return [
            self._decode_row(row)
            for row in rows
        ]

    def count(self) -> int:
        conn = self._connect()

        try:
            row = conn.execute(
                "SELECT COUNT(*) AS total FROM match_history"
            ).fetchone()
        finally:
            conn.close()

        return int(row["total"] if row else 0)

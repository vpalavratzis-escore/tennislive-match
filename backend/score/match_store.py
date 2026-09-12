import json
import os
import threading
import time
import uuid
from typing import Any, Dict, Optional

_MATCH_LOCK = threading.Lock()


class MatchStore:
    """
    Stores the currently active match for each court.

    File format:
    {
      "gr/attica/club/court-1": {
        "matchId": "...",
        "courtId": "...",
        "status": "LIVE",
        "startedAt": 1234567890000,
        "endedAt": null,
        "nameA": "...",
        "nameB": "..."
      }
    }
    """

    def __init__(self, filepath: str):
        self.filepath = filepath
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

    def _read_all(self) -> Dict[str, Dict[str, Any]]:
        if not os.path.exists(self.filepath):
            return {}

        with open(self.filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_all(self, data: Dict[str, Dict[str, Any]]) -> None:
        tmp = self.filepath + ".tmp"

        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(
                data,
                f,
                ensure_ascii=False,
                separators=(",", ":"),
            )

        os.replace(tmp, self.filepath)

    def get_active(self, court_id: str) -> Optional[Dict[str, Any]]:
        with _MATCH_LOCK:
            data = self._read_all()
            match = data.get(court_id)

            if not match or match.get("status") != "LIVE":
                return None

            return dict(match)

    def get_latest(self, court_id: str) -> Optional[Dict[str, Any]]:
        """
        Returns the latest stored match for the court,
        whether it is LIVE or ENDED.
        """
        with _MATCH_LOCK:
            data = self._read_all()
            match = data.get(court_id)

            if not match:
                return None

            return dict(match)

    def list_active(self):
        """Return a snapshot of all LIVE matches for lifecycle maintenance."""
        with _MATCH_LOCK:
            data = self._read_all()
            return [dict(match) for match in data.values() if match.get("status") == "LIVE"]

    def start(
        self,
        court_id: str,
        name_a: str = "",
        name_b: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        now_ms = int(time.time() * 1000)

        match = {
            "matchId": f"match_{uuid.uuid4().hex}",
            "courtId": court_id,
            "status": "LIVE",
            "startedAt": now_ms,
            "endedAt": None,
            "nameA": str(name_a or ""),
            "nameB": str(name_b or ""),
            "metadata": metadata or {},
        }

        with _MATCH_LOCK:
            data = self._read_all()
            data[court_id] = match
            self._write_all(data)

        return dict(match)

    def update_active(
        self,
        court_id: str,
        name_a: Optional[str] = None,
        name_b: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Updates the active match without changing its matchId or startedAt.

        Used when the tablet changes rules, format or player names
        while a match is already running.
        """
        with _MATCH_LOCK:
            data = self._read_all()
            match = data.get(court_id)

            if not match or match.get("status") != "LIVE":
                return None

            match = dict(match)

            if name_a is not None:
                match["nameA"] = str(name_a or "")

            if name_b is not None:
                match["nameB"] = str(name_b or "")

            if metadata:
                current_metadata = dict(match.get("metadata") or {})
                current_metadata.update(dict(metadata))
                match["metadata"] = current_metadata

            data[court_id] = match
            self._write_all(data)

        return dict(match)

    def end(
        self,
        court_id: str,
        result: Optional[Dict[str, Any]] = None,
        ended_at_ms: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Ends a match using final result information supplied by the tablet.

        No winner or tennis-rule calculation is performed here.
        """
        now_ms = int(time.time() * 1000)
        final_result = dict(result or {})

        with _MATCH_LOCK:
            data = self._read_all()
            match = data.get(court_id)

            if not match:
                return None

            match = dict(match)
            match["status"] = "ENDED"
            match["endedAt"] = int(ended_at_ms or now_ms)

            allowed_fields = (
                "winner",
                "winnerName",
                "finalScore",
                "durationSeconds",
                "formatLabel",
                "rules",
                "nameA",
                "nameB",
                "setsA",
                "setsB",
                "gamesA",
                "gamesB",
            )

            for field in allowed_fields:
                if field in final_result:
                    match[field] = final_result[field]

            final_metadata = final_result.get("metadata")

            if isinstance(final_metadata, dict):
                current_metadata = dict(match.get("metadata") or {})
                current_metadata.update(final_metadata)
                match["metadata"] = current_metadata

            data[court_id] = match
            self._write_all(data)

        return dict(match)

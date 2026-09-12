import json
import os
import threading
import time
import uuid
from typing import Any, Dict, List

_EVENT_LOCK = threading.Lock()


class EventStore:
    """
    Append-only JSONL event store.

    One event per line:
    data/events/<safe-court-id>.jsonl
    """

    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        os.makedirs(base_dir, exist_ok=True)

    @staticmethod
    def _safe_id(value: str) -> str:
        safe = "".join(
            ch if ch.isalnum() or ch in ("-", "_", ".") else "_"
            for ch in str(value or "")
        )
        return safe.strip("_") or "court"

    def _path_for(self, court_id: str) -> str:
        return os.path.join(
            self.base_dir,
            f"{self._safe_id(court_id)}.jsonl",
        )

    def append(
        self,
        court_id: str,
        event_type: str,
        before: Dict[str, Any],
        after: Dict[str, Any],
        metadata: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        now_ms = int(time.time() * 1000)

        event = {
            "eventId": f"evt_{uuid.uuid4().hex}",
            "version": 1,
            "courtId": court_id,
            "matchId": str(after.get("matchId") or ""),
            "type": str(event_type or "STATE_CHANGE"),
            "timestamp": now_ms,
            "before": before or {},
            "after": after or {},
            "metadata": metadata or {},
        }

        path = self._path_for(court_id)

        with _EVENT_LOCK:
            with open(path, "a", encoding="utf-8") as f:
                f.write(
                    json.dumps(
                        event,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    + "\n"
                )
                f.flush()
                os.fsync(f.fileno())

        return event

    def clear_court(
        self,
        court_id: str,
    ) -> bool:
        """
        Clears the current event timeline for one court.

        Saved MP4 clips are not deleted here.
        """
        path = self._path_for(court_id)

        with _EVENT_LOCK:
            if not os.path.exists(path):
                return False

            try:
                os.remove(path)
                return True
            except FileNotFoundError:
                return False

    def get_event(
        self,
        event_id: str,
    ) -> Dict[str, Any] | None:
        wanted = str(event_id or "").strip()

        if not wanted:
            return None

        with _EVENT_LOCK:
            filenames = [
                os.path.join(self.base_dir, name)
                for name in os.listdir(self.base_dir)
                if name.endswith(".jsonl")
            ]

            for filepath in filenames:
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        for line in f:
                            try:
                                event = json.loads(line)
                            except Exception:
                                continue

                            if event.get("eventId") == wanted:
                                return event
                except FileNotFoundError:
                    continue

        return None

    def list_recent(
        self,
        court_id: str,
        limit: int = 100,
        match_id: str = "",
    ) -> List[Dict[str, Any]]:
        path = self._path_for(court_id)

        if not os.path.exists(path):
            return []

        with _EVENT_LOCK:
            with open(path, "r", encoding="utf-8") as f:
                lines = f.readlines()

        events: List[Dict[str, Any]] = []

        for line in lines:
            try:
                event = json.loads(line)
            except Exception:
                continue

            if match_id and event.get("matchId") != match_id:
                continue

            events.append(event)

        return events[-max(1, min(limit, 1000)):]

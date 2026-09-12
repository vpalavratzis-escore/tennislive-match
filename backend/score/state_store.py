import json
import os
import time
import threading
from typing import Any, Dict, Optional

_LOCK = threading.Lock()

class StateStore:
    """
    Simple JSON file store:
    data/state.json contains:
      {
        "gr/attica/kavouri-tennis-club/court-1": { ...state... },
        ...
      }
    Atomic writes to avoid corruption.
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
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, self.filepath)

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        with _LOCK:
            data = self._read_all()
            return data.get(key)

    def set(self, key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        now_ms = int(time.time() * 1000)
        payload = dict(payload or {})
        payload["updatedAt"] = now_ms

        with _LOCK:
            data = self._read_all()
            data[key] = payload
            self._write_all(data)

        return payload

import os
import re
import time
from typing import Any, Callable, Dict


DEFAULT_PLAYER_MEDIA_DIR = "/var/www/tennislive/media"


def canonical_no_match_state() -> Dict[str, Any]:
    """Return a match-free court state; StateStore supplies updatedAt."""
    return {
        "matchStatus": "NO_MATCH",
        "nameA": "Player A",
        "nameB": "Player B",
        "pointA": "0",
        "pointB": "0",
        "gamesA": 0,
        "gamesB": 0,
        "setsA": 0,
        "setsB": 0,
        "server": "A",
    }


def completed_current_state(
    state: Dict[str, Any],
    active: Dict[str, Any],
    result: Dict[str, Any],
    ended_at_ms: int,
) -> Dict[str, Any]:
    """Build the public final snapshot for a genuinely completed match."""
    completed = dict(state or {})
    completed.update(
        {
            "matchStatus": "COMPLETED",
            "matchId": active.get("matchId", ""),
            "startedAt": active.get("startedAt"),
            "endedAt": ended_at_ms,
        }
    )

    for field in (
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
    ):
        if field in result:
            completed[field] = result[field]

    return completed


def clear_current_player_photos(
    court_id: str,
    media_dir: str = DEFAULT_PLAYER_MEDIA_DIR,
) -> list[str]:
    """Clear current/staging portraits while leaving archived copies intact."""
    court_leaf = str(court_id or "").strip("/").split("/")[-1]
    safe_leaf = re.sub(r"[^A-Za-z0-9_-]+", "", court_leaf)
    if not safe_leaf:
        return []

    deleted = []
    for directory in (media_dir, os.path.join(media_dir, ".match-staging")):
        for side in ("A", "B"):
            for extension in (".jpg", ".png"):
                path = os.path.join(directory, f"{safe_leaf}_{side}{extension}")
                try:
                    os.remove(path)
                    deleted.append(path)
                except FileNotFoundError:
                    pass
    return deleted


def _sets_needed(rules: Dict[str, Any]) -> int:
    try:
        best_of_sets = max(1, int((rules or {}).get("bestOfSets") or 3))
    except (TypeError, ValueError):
        best_of_sets = 3
    return best_of_sets // 2 + 1


def close_stale_matches(
    store,
    event_store,
    match_store,
    match_history_store,
    stale_timeout_seconds: int,
    now_ms: int | None = None,
    media_dir: str = DEFAULT_PLAYER_MEDIA_DIR,
    photo_clearer: Callable[[str, str], list[str]] = clear_current_player_photos,
) -> list[Dict[str, Any]]:
    """Archive stale matches and independently settle their public state."""
    now_ms = int(now_ms or time.time() * 1000)
    closed = []

    for active in match_store.list_active():
        court_id = str(active.get("courtId") or "")
        match_id = str(active.get("matchId") or "")
        state = store.get(court_id) or {}
        last_activity = int(state.get("updatedAt") or active.get("startedAt") or 0)

        if (
            not last_activity
            or now_ms - last_activity < stale_timeout_seconds * 1000
        ):
            continue

        sets_a = int(state.get("setsA") or 0)
        sets_b = int(state.get("setsB") or 0)
        active_metadata = dict(active.get("metadata") or {})
        rules = state.get("rules") or active_metadata.get("rules") or {}
        completed = (
            max(sets_a, sets_b) >= _sets_needed(rules)
            and sets_a != sets_b
        )
        winner = "A" if completed and sets_a > sets_b else "B" if completed else ""
        events = event_store.list_recent(
            court_id,
            limit=5000,
            match_id=match_id,
        )
        started_at = int(active.get("startedAt") or 0)
        duration_seconds = max(0, (now_ms - started_at) // 1000) if started_at else 0
        archive_status = "COMPLETED" if completed else "TIMED_OUT"
        result = {
            "winner": winner,
            "winnerName": state.get(f"name{winner}", "") if winner else "",
            "finalScore": f"{sets_a}-{sets_b}",
            "nameA": state.get("nameA") or active.get("nameA", ""),
            "nameB": state.get("nameB") or active.get("nameB", ""),
            "setsA": sets_a,
            "setsB": sets_b,
            "gamesA": int(state.get("gamesA") or 0),
            "gamesB": int(state.get("gamesB") or 0),
            "rules": rules,
            "durationSeconds": duration_seconds,
            "metadata": {
                "endReason": "STALE_TIMEOUT",
                "staleTimeoutSeconds": stale_timeout_seconds,
            },
        }
        payload = dict(active)
        payload.update(result)
        payload.update(
            {
                "status": archive_status,
                "endedAt": now_ms,
                "finalState": dict(state),
                "events": events,
                "eventCount": len(events),
            }
        )
        payload["metadata"] = active_metadata | result["metadata"]
        if started_at:
            payload["durationSeconds"] = duration_seconds

        match_history_store.archive(payload, archive_status=archive_status)

        if completed:
            settled = match_store.end(
                court_id,
                result=result,
                ended_at_ms=now_ms,
                expected_match_id=match_id,
            )
            if settled is None:
                continue
            store.set(
                court_id,
                completed_current_state(state, active, result, now_ms),
            )
            current_state = "COMPLETED"
            photos_cleared = []
        else:
            settled = match_store.clear_current(
                court_id,
                expected_match_id=match_id,
            )
            if settled is None:
                continue
            store.set(court_id, canonical_no_match_state())
            event_store.clear_court(court_id)
            photos_cleared = photo_clearer(court_id, media_dir)
            current_state = "NO_MATCH"

        closed.append(
            {
                "courtId": court_id,
                "matchId": match_id,
                "archiveStatus": archive_status,
                "currentState": current_state,
                "photosCleared": photos_cleared,
            }
        )

    return closed

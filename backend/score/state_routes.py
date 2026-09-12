import os
import threading
import time
from typing import Any, Dict
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from state_store import StateStore
from event_store import EventStore
from match_store import MatchStore
from match_history_store import MatchHistoryStore
from stale_match_lifecycle import (
    canonical_no_match_state,
    clear_current_player_photos,
    close_stale_matches as settle_stale_matches,
    completed_current_state,
)
from clip_worker import schedule_event_clip

def mount_state_api(app):
    """
    Mounts:
      GET  /api/state/{country}/{city}/{club}/{court}
      POST /api/state/{country}/{city}/{club}/{court}
    Adds CORS for:
      - https://escoreboards.eu  (site)
      - https://www.escoreboards.eu
      - http://localhost:5173   (dev)
    """
    # CORS (needed because site domain != api domain)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://escoreboards.eu",
            "https://www.escoreboards.eu",
            "https://voxcourt.com",
            "https://www.voxcourt.com",
            "http://localhost:5173",
        ],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        max_age=600,
    )

    store = StateStore("/opt/tennislive-score/data/state.json")
    event_store = EventStore("/opt/tennislive-score/data/events")
    match_store = MatchStore("/opt/tennislive-score/data/matches.json")
    match_history_store = MatchHistoryStore(
        "/opt/tennislive-score/data/match_history.db"
    )
    router = APIRouter()

    stale_timeout_seconds = max(60, int(os.getenv("MATCH_STALE_TIMEOUT_SECONDS", "21600")))

    def close_stale_matches(now_ms=None):
        """Archive inactive LIVE matches without treating viewer reads as activity."""
        return settle_stale_matches(
            store=store,
            event_store=event_store,
            match_store=match_store,
            match_history_store=match_history_store,
            stale_timeout_seconds=stale_timeout_seconds,
            now_ms=now_ms,
        )

    def stale_match_worker():
        while True:
            try:
                close_stale_matches()
            except Exception as exc:
                print("STALE MATCH WORKER ERROR:", repr(exc), flush=True)
            time.sleep(min(300, max(30, stale_timeout_seconds // 12)))

    threading.Thread(target=stale_match_worker, name="voxcourt-stale-match-worker", daemon=True).start()

    tracked_fields = (
        "pointA",
        "pointB",
        "gamesA",
        "gamesB",
        "setsA",
        "setsB",
        "server",
    )

    def tracked_snapshot(state: Dict[str, Any] | None) -> Dict[str, Any]:
        source = state or {}
        return {
            field: source.get(field)
            for field in tracked_fields
        }

    def detect_winner(
        event_type: str,
        before: Dict[str, Any],
        after: Dict[str, Any],
    ) -> str:
        if event_type == "SET":
            if (after.get("setsA") or 0) > (before.get("setsA") or 0):
                return "A"
            if (after.get("setsB") or 0) > (before.get("setsB") or 0):
                return "B"

        if event_type == "GAME":
            if (after.get("gamesA") or 0) > (before.get("gamesA") or 0):
                return "A"
            if (after.get("gamesB") or 0) > (before.get("gamesB") or 0):
                return "B"

        if event_type == "POINT":
            point_order = {
                "0": 0,
                "15": 1,
                "30": 2,
                "40": 3,
                "AD": 4,
                "A": 4,
            }

            before_a = point_order.get(str(before.get("pointA")).upper())
            after_a = point_order.get(str(after.get("pointA")).upper())
            before_b = point_order.get(str(before.get("pointB")).upper())
            after_b = point_order.get(str(after.get("pointB")).upper())

            if (
                before_a is not None
                and after_a is not None
                and after_a > before_a
            ):
                return "A"

            if (
                before_b is not None
                and after_b is not None
                and after_b > before_b
            ):
                return "B"

        return ""

    def detect_event_type(
        before: Dict[str, Any],
        after: Dict[str, Any],
    ) -> str:
        if (
            before.get("setsA") != after.get("setsA")
            or before.get("setsB") != after.get("setsB")
        ):
            return "SET"

        if (
            before.get("gamesA") != after.get("gamesA")
            or before.get("gamesB") != after.get("gamesB")
        ):
            return "GAME"

        if (
            before.get("pointA") != after.get("pointA")
            or before.get("pointB") != after.get("pointB")
        ):
            return "POINT"

        if before.get("server") != after.get("server"):
            return "SERVER_CHANGE"

        return "STATE_CHANGE"

    def key(country: str, city: str, club: str, court: str) -> str:
        return f"{country}/{city}/{club}/{court}"

    @router.get("/api/state/{country}/{city}/{club}/{court}")
    def state_get(country: str, city: str, club: str, court: str):
        k = key(country, city, club, court)
        data = store.get(k)

        if not data:
            # default empty state
            data = canonical_no_match_state()
            data["updatedAt"] = 0

        return JSONResponse(data)

    def is_tablet_reset_state(
        saved: Dict[str, Any],
    ) -> bool:
        """
        Detects the current tablet reset payload.

        The tablet currently does not send an explicit RESET flag.
        """
        name_a = str(saved.get("nameA") or "").strip()
        name_b = str(saved.get("nameB") or "").strip()

        point_a = str(saved.get("pointA") or "0").strip().upper()
        point_b = str(saved.get("pointB") or "0").strip().upper()

        games_a = int(saved.get("gamesA") or 0)
        games_b = int(saved.get("gamesB") or 0)

        sets_a = int(saved.get("setsA") or 0)
        sets_b = int(saved.get("setsB") or 0)

        match_status = str(
            saved.get("matchStatus") or ""
        ).strip().upper()

        return (
            name_a in ("", "Player A")
            and name_b in ("", "Player B")
            and point_a == "0"
            and point_b == "0"
            and games_a == 0
            and games_b == 0
            and sets_a == 0
            and sets_b == 0
            and match_status not in ("LIVE", "ENDED")
        )

    @router.post("/api/state/{country}/{city}/{club}/{court}")
    def state_set(
        country: str,
        city: str,
        club: str,
        court: str,
        payload: Dict[str, Any] = Body(...)
    ):
        k = key(country, city, club, court)

        previous = store.get(k) or {}
        had_previous_state = bool(previous)
        before = tracked_snapshot(previous)

        saved = store.set(k, payload)
        after = tracked_snapshot(saved)

        tablet_reset = is_tablet_reset_state(saved)

        if tablet_reset:
            active_match = match_store.get_active(k)

            ended_match = None
            archived_match = None
            archive_error = ""
            archive_ok = active_match is None
            archive_status = ""
            match_events = []

            if active_match is not None:
                match_id = str(
                    active_match.get("matchId") or ""
                ).strip()

                if match_id:
                    match_events = event_store.list_recent(
                        k,
                        limit=5000,
                        match_id=match_id,
                    )

                previous_is_default = is_tablet_reset_state(previous)

                sets_a = int(previous.get("setsA") or 0)
                sets_b = int(previous.get("setsB") or 0)

                active_metadata = dict(
                    active_match.get("metadata") or {}
                )

                rules = (
                    previous.get("rules")
                    or active_metadata.get("rules")
                    or {}
                )

                try:
                    best_of_sets = int(
                        rules.get("bestOfSets") or 3
                    )
                except Exception:
                    best_of_sets = 3

                best_of_sets = max(1, best_of_sets)

                sets_needed_to_win = (
                    best_of_sets // 2
                ) + 1

                match_completed = (
                    not previous_is_default
                    and max(sets_a, sets_b) >= sets_needed_to_win
                )

                archive_status = (
                    "COMPLETED"
                    if match_completed
                    else "ABORTED"
                )

                winner = ""

                if match_completed:
                    if sets_a > sets_b:
                        winner = "A"
                    elif sets_b > sets_a:
                        winner = "B"

                name_a = str(
                    previous.get("nameA")
                    or active_match.get("nameA")
                    or ""
                )

                name_b = str(
                    previous.get("nameB")
                    or active_match.get("nameB")
                    or ""
                )

                winner_name = ""

                if winner == "A":
                    winner_name = name_a
                elif winner == "B":
                    winner_name = name_b

                final_result = {
                    "winner": winner,
                    "winnerName": winner_name,
                    "finalScore": f"{sets_a}-{sets_b}",
                    "formatLabel": (
                        previous.get("formatLabel")
                        or active_metadata.get("formatLabel")
                        or ""
                    ),
                    "rules": (
                        previous.get("rules")
                        or active_metadata.get("rules")
                        or {}
                    ),
                    "nameA": name_a,
                    "nameB": name_b,
                    "setsA": sets_a,
                    "setsB": sets_b,
                    "gamesA": int(previous.get("gamesA") or 0),
                    "gamesB": int(previous.get("gamesB") or 0),
                    "metadata": {
                        "source": "tablet_state",
                        "endReason": "TABLET_RESET",
                    },
                }

                ended_at_ms = int(time.time() * 1000)

                archive_payload = dict(active_match)
                archive_payload["status"] = archive_status
                archive_payload["endedAt"] = ended_at_ms

                for field, value in final_result.items():
                    if field != "metadata":
                        archive_payload[field] = value

                archive_metadata = dict(
                    active_match.get("metadata") or {}
                )

                archive_metadata.update(
                    final_result.get("metadata") or {}
                )

                archive_metadata["endReason"] = "TABLET_RESET"
                archive_metadata["archiveVersion"] = 1

                archive_payload["metadata"] = archive_metadata

                started_at = int(
                    archive_payload.get("startedAt") or 0
                )

                if (
                    started_at > 0
                    and ended_at_ms >= started_at
                ):
                    archive_payload["durationSeconds"] = (
                        ended_at_ms - started_at
                    ) // 1000

                archive_payload["finalState"] = dict(previous)
                archive_payload["eventCount"] = len(match_events)
                archive_payload["events"] = match_events

                try:
                    archived_match = match_history_store.archive(
                        archive_payload,
                        archive_status=archive_status,
                    )

                    if archive_status == "COMPLETED":
                        ended_match = match_store.end(
                            court_id=k,
                            result=final_result,
                            ended_at_ms=ended_at_ms,
                            expected_match_id=match_id,
                        )
                    else:
                        ended_match = match_store.clear_current(
                            court_id=k,
                            expected_match_id=match_id,
                        )

                    if ended_match is None:
                        raise RuntimeError(
                            "archive succeeded but current match could not be settled"
                        )

                    archive_ok = True

                except Exception as exc:
                    archive_error = str(exc)

                    print(
                        "MATCH HISTORY ARCHIVE ERROR:",
                        repr(exc),
                        flush=True,
                    )

            if archive_ok and archive_status == "COMPLETED":
                saved = store.set(
                    k,
                    completed_current_state(
                        previous,
                        active_match,
                        final_result,
                        ended_at_ms,
                    ),
                )
                events_cleared = False
            elif archive_ok:
                saved = store.set(k, canonical_no_match_state())
                events_cleared = event_store.clear_court(k)
                clear_current_player_photos(k)
            else:
                # Preserve live event data if permanent archival failed.
                events_cleared = False

            return {
                "ok": True,
                "key": k,
                "saved": saved,
                "event": None,
                "matchLifecycle": {
                    "action": "RESET",
                    "match": ended_match,
                },
                "reset": {
                    "eventsCleared": events_cleared,
                    "archived": archived_match is not None,
                    "archiveStatus": archive_status,
                    "archiveError": archive_error,
                    "eventCount": len(match_events),
                },
            }

        tablet_match_status = str(
            saved.get("matchStatus") or ""
        ).strip().upper()

        active_match = match_store.get_active(k)

        # Η σημερινή έκδοση του tablet δεν στέλνει matchStatus.
        # Αν υπάρχει ήδη active match, κάθε non-reset payload
        # θεωρείται συνέχεια του LIVE match.
        if not tablet_match_status and active_match is not None:
            tablet_match_status = "LIVE"

        # Μετά από reset, το πρώτο πραγματικό non-default state
        # ξεκινά αυτόματα νέο match.
        if not tablet_match_status and active_match is None:
            name_a = str(saved.get("nameA") or "").strip()
            name_b = str(saved.get("nameB") or "").strip()

            point_a = str(
                saved.get("pointA") or "0"
            ).strip().upper()

            point_b = str(
                saved.get("pointB") or "0"
            ).strip().upper()

            games_a = int(saved.get("gamesA") or 0)
            games_b = int(saved.get("gamesB") or 0)
            sets_a = int(saved.get("setsA") or 0)
            sets_b = int(saved.get("setsB") or 0)

            has_real_match_state = (
                name_a not in ("", "Player A")
                or name_b not in ("", "Player B")
                or point_a != "0"
                or point_b != "0"
                or games_a != 0
                or games_b != 0
                or sets_a != 0
                or sets_b != 0
            )

            if has_real_match_state:
                tablet_match_status = "LIVE"
        match_lifecycle = None
        new_match_started = False

        live_metadata = {
            "source": "tablet_state",
            "formatLabel": saved.get("formatLabel", ""),
            "rules": saved.get("rules") or {},
        }

        if tablet_match_status == "LIVE":
            if active_match is None:
                active_match = match_store.start(
                    court_id=k,
                    name_a=saved.get("nameA", ""),
                    name_b=saved.get("nameB", ""),
                    metadata=live_metadata,
                )

                new_match_started = True

                match_lifecycle = {
                    "action": "STARTED",
                    "match": active_match,
                }
            else:
                active_match = match_store.update_active(
                    court_id=k,
                    name_a=saved.get("nameA"),
                    name_b=saved.get("nameB"),
                    metadata=live_metadata,
                )

                match_lifecycle = {
                    "action": "UPDATED",
                    "match": active_match,
                }

        elif tablet_match_status == "ENDED":
            if active_match is None:
                latest_match = match_store.get_latest(k)

                if latest_match and latest_match.get("status") == "ENDED":
                    active_match = latest_match
                else:
                    active_match = match_store.start(
                        court_id=k,
                        name_a=saved.get("nameA", ""),
                        name_b=saved.get("nameB", ""),
                        metadata=live_metadata,
                    )

            final_result = {
                "winner": saved.get("winner", ""),
                "winnerName": saved.get("winnerName", ""),
                "finalScore": saved.get("finalScore", ""),
                "durationSeconds": saved.get("durationSeconds", 0),
                "formatLabel": saved.get("formatLabel", ""),
                "rules": saved.get("rules") or {},
                "nameA": saved.get("nameA", ""),
                "nameB": saved.get("nameB", ""),
                "setsA": saved.get("setsA", 0),
                "setsB": saved.get("setsB", 0),
                "gamesA": saved.get("gamesA", 0),
                "gamesB": saved.get("gamesB", 0),
                "metadata": {
                    "source": "tablet_state",
                },
            }

            ended_match = match_store.end(
                court_id=k,
                result=final_result,
            )

            if ended_match:
                active_match = ended_match
                match_lifecycle = {
                    "action": "ENDED",
                    "match": ended_match,
                }

        event = None

        # Το πρώτο payload αρχικοποιεί το court και δεν είναι
        # πραγματικό POINT / GAME / SET event.
        if (
            had_previous_state
            and not new_match_started
            and before != after
        ):
            event_type = detect_event_type(before, after)
            scoring_side = detect_winner(
                event_type,
                before,
                after,
            )

            event_after = dict(after)

            if active_match:
                event_after["matchId"] = active_match.get("matchId", "")

            is_scoring_event = event_type in ("POINT", "GAME", "SET")
            is_valid_score = (
                not is_scoring_event
                or scoring_side in ("A", "B")
            )

            stored_event_type = (
                event_type
                if is_valid_score
                else "CORRECTION"
            )

            event_metadata = {
                "source": "state_api",
                "nameA": saved.get("nameA", ""),
                "nameB": saved.get("nameB", ""),
                "scoringSide": scoring_side,
                "serverBefore": before.get("server", ""),
                "serverAfter": after.get("server", ""),
            }

            if not is_valid_score:
                event_metadata["originalDetectedType"] = event_type
                event_metadata["action"] = "UNDO_OR_CORRECTION"

            if is_valid_score:
                event_metadata["replay"] = {
                    "cam": "cam1",
                    "secondsBefore": 30,
                    "secondsAfter": 2,
                }

            event = event_store.append(
                court_id=k,
                event_type=stored_event_type,
                before=before,
                after=event_after,
                metadata=event_metadata,
            )

            if is_valid_score:
                schedule_event_clip(
                    event,
                    delay_seconds=12,
                )

        return {
            "ok": True,
            "key": k,
            "saved": saved,
            "event": event,
            "matchLifecycle": match_lifecycle,
        }

    @router.get("/api/matches/history")
    def match_history_list(
        limit: int = 100,
        courtId: str = "",
        status: str = "",
    ):
        items = match_history_store.list_recent(
            limit=max(1, min(int(limit), 1000)),
            court_id=str(courtId or ""),
            archive_status=str(status or ""),
        )

        return {
            "ok": True,
            "count": len(items),
            "items": items,
        }


    @router.get("/api/matches/history/{match_id}")
    def match_history_get(
        match_id: str,
    ):
        match = match_history_store.get(match_id)

        return {
            "ok": match is not None,
            "match": match,
        }


    @router.post("/api/matches/start/{country}/{city}/{club}/{court}")
    def match_start(
        country: str,
        city: str,
        club: str,
        court: str,
        payload: Dict[str, Any] = Body(default={}),
    ):
        k = key(country, city, club, court)
        current_state = store.get(k) or {}

        match = match_store.start(
            court_id=k,
            name_a=payload.get("nameA") or current_state.get("nameA", ""),
            name_b=payload.get("nameB") or current_state.get("nameB", ""),
            metadata=payload.get("metadata") or {},
        )

        return {
            "ok": True,
            "match": match,
        }

    @router.post("/api/matches/end/{country}/{city}/{club}/{court}")
    def match_end(
        country: str,
        city: str,
        club: str,
        court: str,
    ):
        k = key(country, city, club, court)
        match = match_store.end(k)

        return {
            "ok": match is not None,
            "match": match,
        }

    @router.get("/api/matches/active/{country}/{city}/{club}/{court}")
    def match_active(
        country: str,
        city: str,
        club: str,
        court: str,
    ):
        k = key(country, city, club, court)
        match = match_store.get_active(k)

        return {
            "ok": True,
            "match": match,
        }

    def build_event_display(event: Dict[str, Any]) -> Dict[str, Any]:
        after = event.get("after") or {}
        metadata = event.get("metadata") or {}

        event_type = str(event.get("type") or "STATE_CHANGE").upper()
        scoring_side = str(
            metadata.get("scoringSide")
            or metadata.get("winner")
            or ""
        )
        server = str(
            metadata.get("serverAfter")
            or after.get("server")
            or ""
        )

        point_a = str(after.get("pointA", "0"))
        point_b = str(after.get("pointB", "0"))
        games_a = after.get("gamesA", 0)
        games_b = after.get("gamesB", 0)
        sets_a = after.get("setsA", 0)
        sets_b = after.get("setsB", 0)

        if event_type == "GAME":
            title = (
                f"GAME {scoring_side}"
                if scoring_side
                else "GAME"
            )
        elif event_type == "SET":
            title = (
                f"SET {scoring_side}"
                if scoring_side
                else "SET"
            )
        elif event_type == "POINT":
            title = (
                f"POINT {scoring_side}"
                if scoring_side
                else "POINT"
            )
        elif event_type == "SERVER_CHANGE":
            title = f"SERVER {server}" if server else "SERVER CHANGE"
        else:
            title = event_type.replace("_", " ")

        event_id = str(event.get("eventId") or "").strip()
        match_id = str(event.get("matchId") or "").strip()

        replay_available = False

        if event_id and match_id:
            safe_match_id = "".join(
                ch if ch.isalnum() or ch in ("-", "_", ".") else "_"
                for ch in match_id
            ).strip("_")

            safe_event_id = "".join(
                ch if ch.isalnum() or ch in ("-", "_", ".") else "_"
                for ch in event_id
            ).strip("_")

            clip_path = (
                f"/srv/event-clips/{safe_match_id}/{safe_event_id}.mp4"
            )

            replay_available = (
                os.path.exists(clip_path)
                and os.path.getsize(clip_path) >= 50000
            )

        return {
            "title": title,
            "type": event_type,
            "score": f"{point_a}-{point_b}",
            "games": f"{games_a}-{games_b}",
            "sets": f"{sets_a}-{sets_b}",
            "scoringSide": scoring_side,
            "winner": scoring_side,
            "server": server,
            "timestamp": event.get("timestamp"),
            "replayAvailable": replay_available,
        }

    @router.get("/api/matches/latest/{country}/{city}/{club}/{court}")
    def match_latest(
        country: str,
        city: str,
        club: str,
        court: str,
    ):
        k = key(country, city, club, court)
        match = match_store.get_latest(k)

        return {
            "ok": True,
            "match": match,
        }

    @router.get("/api/events/{country}/{city}/{club}/{court}")
    def events_get(
        country: str,
        city: str,
        club: str,
        court: str,
        limit: int = 100,
        matchId: str = "",
    ):
        k = key(country, city, club, court)

        events = event_store.list_recent(
            k,
            limit=max(1, min(int(limit), 1000)),
            match_id=str(matchId or ""),
        )

        enriched_events = []

        for event in events:
            item = dict(event)
            item["display"] = build_event_display(item)
            enriched_events.append(item)

        return {
            "ok": True,
            "courtId": k,
            "matchId": str(matchId or ""),
            "events": enriched_events,
        }

    app.include_router(router)

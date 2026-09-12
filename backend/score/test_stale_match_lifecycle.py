import os
import tempfile
import unittest
from unittest.mock import patch

from event_store import EventStore
from match_history_store import MatchHistoryStore
from match_store import MatchStore
from stale_match_lifecycle import close_stale_matches
from state_store import StateStore


STALE_TIMEOUT_SECONDS = 21600


class StaleMatchLifecycleTests(unittest.TestCase):
    def stores(self, directory):
        return (
            StateStore(os.path.join(directory, "state.json")),
            EventStore(os.path.join(directory, "events")),
            MatchStore(os.path.join(directory, "matches.json")),
            MatchHistoryStore(os.path.join(directory, "match_history.db")),
        )

    def write_player_photo(self, media_dir, side="A"):
        os.makedirs(os.path.join(media_dir, ".match-staging"), exist_ok=True)
        content = b"mock-player-photo"
        for directory in (media_dir, os.path.join(media_dir, ".match-staging")):
            with open(os.path.join(directory, f"court-1_{side}.jpg"), "wb") as photo:
                photo.write(content)

    def test_incomplete_stale_match_archives_timed_out_and_resets_current_state(self):
        with tempfile.TemporaryDirectory() as directory:
            state_store, event_store, match_store, history_store = self.stores(directory)
            media_dir = os.path.join(directory, "media")
            archive_dir = os.path.join(media_dir, "match-archive")
            self.write_player_photo(media_dir)
            court = "gr/test/club/court-1"
            active = match_store.start(court, "Old Player A", "Old Player B")
            state = state_store.set(
                court,
                {
                    "matchStatus": "LIVE",
                    "matchId": active["matchId"],
                    "startedAt": active["startedAt"],
                    "nameA": "Old Player A",
                    "nameB": "Old Player B",
                    "photoA": "https://example.test/old-a.jpg",
                    "photoB": "https://example.test/old-b.jpg",
                    "pointA": "30",
                    "pointB": "15",
                    "gamesA": 4,
                    "gamesB": 3,
                    "setsA": 1,
                    "setsB": 0,
                    "server": "A",
                    "winner": "A",
                    "replayEventId": "old-replay",
                    "rules": {"bestOfSets": 3},
                },
            )
            event_store.append(
                court,
                "POINT",
                {"pointA": "15"},
                {"pointA": "30", "matchId": active["matchId"]},
            )
            stale_now = state["updatedAt"] + STALE_TIMEOUT_SECONDS * 1000 + 1

            with (
                patch("match_history_store._VC_PHOTO_STAGING_DIR", os.path.join(media_dir, ".match-staging")),
                patch("match_history_store._VC_ARCHIVE_MEDIA_DIR", archive_dir),
            ):
                closed = close_stale_matches(
                    state_store,
                    event_store,
                    match_store,
                    history_store,
                    STALE_TIMEOUT_SECONDS,
                    now_ms=stale_now,
                    media_dir=media_dir,
                )

            self.assertEqual(closed[0]["archiveStatus"], "TIMED_OUT")
            self.assertEqual(closed[0]["currentState"], "NO_MATCH")
            self.assertIsNone(match_store.get_latest(court))
            reset = state_store.get(court)
            self.assertEqual(reset["matchStatus"], "NO_MATCH")
            self.assertEqual(reset["nameA"], "Player A")
            self.assertEqual(reset["nameB"], "Player B")
            self.assertEqual(reset["pointA"], "0")
            self.assertEqual(reset["gamesA"], 0)
            self.assertEqual(reset["setsA"], 0)
            for field in ("matchId", "startedAt", "winner", "photoA", "photoB", "replayEventId", "rules"):
                self.assertNotIn(field, reset)
            self.assertEqual(event_store.list_recent(court), [])
            self.assertFalse(os.path.exists(os.path.join(media_dir, "court-1_A.jpg")))
            self.assertFalse(os.path.exists(os.path.join(media_dir, ".match-staging", "court-1_A.jpg")))

            timed_out = history_store.list_recent(court_id=court, archive_status="TIMED_OUT")
            self.assertEqual(len(timed_out), 1)
            self.assertEqual(timed_out[0]["status"], "TIMED_OUT")
            self.assertEqual(timed_out[0]["nameA"], "Old Player A")
            self.assertEqual(timed_out[0]["finalState"]["pointA"], "30")
            self.assertEqual(history_store.list_recent(court_id=court, archive_status="COMPLETED"), [])
            archived = history_store.get(active["matchId"])
            self.assertEqual(archived["events"][0]["matchId"], active["matchId"])
            self.assertTrue(os.path.exists(os.path.join(archive_dir, active["matchId"], "playerA.jpg")))

    def test_genuine_completed_match_remains_completed_and_publicly_listable(self):
        with tempfile.TemporaryDirectory() as directory:
            state_store, event_store, match_store, history_store = self.stores(directory)
            media_dir = os.path.join(directory, "media")
            archive_dir = os.path.join(media_dir, "match-archive")
            self.write_player_photo(media_dir)
            court = "gr/test/club/court-1"
            active = match_store.start(court, "Champion", "Finalist")
            state = state_store.set(
                court,
                {
                    "matchStatus": "LIVE",
                    "matchId": active["matchId"],
                    "nameA": "Champion",
                    "nameB": "Finalist",
                    "photoA": "https://example.test/champion.jpg",
                    "pointA": "0",
                    "pointB": "0",
                    "gamesA": 6,
                    "gamesB": 4,
                    "setsA": 2,
                    "setsB": 0,
                    "server": "A",
                    "rules": {"bestOfSets": 3},
                },
            )
            stale_now = state["updatedAt"] + STALE_TIMEOUT_SECONDS * 1000 + 1

            with (
                patch("match_history_store._VC_PHOTO_STAGING_DIR", os.path.join(media_dir, ".match-staging")),
                patch("match_history_store._VC_ARCHIVE_MEDIA_DIR", archive_dir),
            ):
                closed = close_stale_matches(
                    state_store,
                    event_store,
                    match_store,
                    history_store,
                    STALE_TIMEOUT_SECONDS,
                    now_ms=stale_now,
                    media_dir=media_dir,
                )

            self.assertEqual(closed[0]["archiveStatus"], "COMPLETED")
            self.assertEqual(closed[0]["currentState"], "COMPLETED")
            latest = match_store.get_latest(court)
            self.assertEqual(latest["status"], "ENDED")
            self.assertEqual(latest["winner"], "A")
            final_state = state_store.get(court)
            self.assertEqual(final_state["matchStatus"], "COMPLETED")
            self.assertEqual(final_state["matchId"], active["matchId"])
            self.assertEqual(final_state["nameA"], "Champion")
            self.assertEqual(final_state["nameB"], "Finalist")
            self.assertEqual(final_state["setsA"], 2)
            self.assertEqual(final_state["setsB"], 0)
            self.assertTrue(os.path.exists(os.path.join(media_dir, "court-1_A.jpg")))

            completed = history_store.list_recent(court_id=court, archive_status="COMPLETED")
            self.assertEqual(len(completed), 1)
            self.assertEqual(completed[0]["status"], "COMPLETED")
            self.assertEqual(completed[0]["winner"], "A")
            self.assertEqual(completed[0]["finalScore"], "2-0")
            self.assertEqual(history_store.list_recent(court_id=court, archive_status="TIMED_OUT"), [])


if __name__ == "__main__":
    unittest.main()

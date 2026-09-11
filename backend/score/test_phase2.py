import os
import tempfile
import unittest
from unittest.mock import patch

from score_actions import ScoreActionService
from flic_adapter import FlicAdapter


class Phase2Tests(unittest.TestCase):
    def test_tennis_scoring_and_idempotency(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(ScoreActionService, "_read_secret", return_value=b"test"):
            service=ScoreActionService(directory); court="gr/test/club/court-1"
            service.state.set(court,{"pointA":"0","pointB":"0","gamesA":0,"gamesB":0,"setsA":0,"setsB":0,"server":"A","matchStatus":"LIVE","matchId":"m1"})
            payload={"action":"POINT_A","eventId":"physical-1","source":"flic","deviceId":"button-a"}
            first=service.apply(court,payload); second=service.apply(court,payload)
            self.assertEqual(first["state"]["pointA"],"15"); self.assertTrue(second["duplicate"]); self.assertEqual(first["sequence"],second["sequence"])

    def test_flic_mapping(self):
        with tempfile.TemporaryDirectory() as directory:
            adapter=FlicAdapter("gr/test/club/court-1","token",queue_path=os.path.join(directory,"queue.db"))
            self.assertEqual(adapter.normalize("flic-1","A","single")["action"],"POINT_A")
            self.assertEqual(adapter.normalize("flic-1","B","double")["action"],"UNDO")
            self.assertEqual(adapter.normalize("flic-1","A","hold")["action"],"MARK_HIGHLIGHT")


if __name__ == "__main__": unittest.main()

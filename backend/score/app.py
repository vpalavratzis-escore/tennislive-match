from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from event_store import EventStore
from starlette.background import BackgroundTask
from pydantic import BaseModel
import json
import os
import tempfile
import time
import secrets
import glob
import shutil
import subprocess

from mobile_routes import mount_mobile_api

STATE_PATH = "/var/www/tennislive/state.json"
API_KEY_PATH = "/etc/tennislive/api_key.txt"

MEDIA_DIR = "/var/www/tennislive/media"
PUBLIC_BASE = "https://api.escoreboards.eu"
REPLAY_ROOT = "/srv/replay"
HLS_ROOT = "/var/www/hls"
EVENT_CLIPS_ROOT = "/srv/event-clips"
EVENT_THUMBNAILS_ROOT = "/srv/event-thumbnails"


def ensure_api_key() -> str:
    os.makedirs(os.path.dirname(API_KEY_PATH), exist_ok=True)

    if not os.path.exists(API_KEY_PATH):
        key = secrets.token_urlsafe(32)
        with open(API_KEY_PATH, "w") as f:
            f.write(key + "\n")
        try:
            os.chmod(API_KEY_PATH, 0o640)
        except Exception:
            pass
        return key

    with open(API_KEY_PATH, "r") as f:
        return f.read().strip()


API_KEY = None

app = FastAPI()
mount_mobile_api(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class Player(BaseModel):
    name: str
    photo: str = ""
    sets: int = 0
    games: int = 0
    points: str = "0"
    serve: bool = False


class State(BaseModel):
    updatedAt: str = ""
    court: str = "Court 1"
    status: str = "LIVE"
    bestOf: int = 3
    playerA: Player
    playerB: Player
    inTiebreak: bool = False
    tiebreakA: int = 0
    tiebreakB: int = 0


def atomic_write(path: str, data: dict):
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="state_", suffix=".json", dir=d)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, path)
    finally:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass


def _require_key(x_api_key: str):
    if not API_KEY:
        raise HTTPException(status_code=500, detail="API key not initialized")
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


def _safe_id(s: str) -> str:
    s = (s or "").strip().lower()
    out = []
    for ch in s:
        if ch.isalnum() or ch in ("-", "_"):
            out.append(ch)
    return "".join(out)[:80] or "court1"


def _court_leaf(court_id: str) -> str:
    parts = [p for p in str(court_id or "").strip("/").split("/") if p]
    return parts[-1] if parts else ""


def _replay_source_candidates(court_id: str, cam: str) -> list[str]:
    cam = (cam or "cam1").strip().lower()
    full_id = str(court_id or "").strip("/").lower()
    leaf = _court_leaf(court_id).lower()

    out = []
    seen = set()

    def add(x: str):
        x = str(x or "").strip()
        if x and x not in seen:
            seen.add(x)
            out.append(x)

    slug_full = full_id.replace("/", "-")
    if slug_full:
        add(f"{slug_full}-{cam}")   # gr-attica-kavouri-tennis-club-court-1-cam1
        add(slug_full)              # gr-attica-kavouri-tennis-club-court-1

    if leaf:
        add(f"{leaf}-{cam}")        # court-1-cam1
        add(leaf)                   # court-1

        court_num = None
        if leaf.startswith("court-"):
            try:
                court_num = int(leaf.split("-", 1)[1])
            except Exception:
                court_num = None

        if court_num is not None:
            add(f"court{court_num}-{cam}")   # court1-cam1
            add(f"court{court_num}")         # court1

    if cam == "cam1":
        add("court1")

    return out


def _replay_dir_has_segments(source: str) -> bool:
    replay_dir = os.path.join(REPLAY_ROOT, source)
    replay_index = os.path.join(replay_dir, "index.m3u8")
    replay_segs = glob.glob(os.path.join(replay_dir, "seg_*.ts"))
    if os.path.exists(replay_index) and len(replay_segs) > 0:
        return True

    hls_index = os.path.join(HLS_ROOT, f"{source}.m3u8")
    hls_segs = glob.glob(os.path.join(HLS_ROOT, f"{source}-*.ts"))
    if os.path.exists(hls_index) and len(hls_segs) > 0:
        return True

    return False


def _pick_replay_source(court_id: str, cam: str) -> str:
    for source in _replay_source_candidates(court_id, cam):
        if _replay_dir_has_segments(source):
            return source
    raise HTTPException(status_code=404, detail="Replay source not found")


def _parse_hls_program_date_time(value: str) -> float:
    from datetime import datetime
    import re

    raw = str(value or "").strip()

    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"

    # Convert timezone format +0000 / -0300 to +00:00 / -03:00
    if re.search(r"[+-]\d{4}$", raw):
        raw = raw[:-5] + raw[-5:-2] + ":" + raw[-2:]

    return datetime.fromisoformat(raw).timestamp()


def _segments_for_timestamp(
    source: str,
    event_timestamp_ms: int,
    seconds_before: int = 30,
    seconds_after: int = 2,
) -> list[str]:
    replay_dir = os.path.join(REPLAY_ROOT, source)
    playlist_path = os.path.join(replay_dir, "index.m3u8")

    if not os.path.exists(playlist_path):
        raise HTTPException(status_code=404, detail="Replay playlist not found")

    with open(playlist_path, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    segments = []
    current_time = None
    current_duration = 0.0

    for line in lines:
        if line.startswith("#EXT-X-PROGRAM-DATE-TIME:"):
            raw_time = line.split(":", 1)[1]
            current_time = _parse_hls_program_date_time(raw_time)
            continue

        if line.startswith("#EXTINF:"):
            raw_duration = line.split(":", 1)[1].rstrip(",")
            try:
                current_duration = float(raw_duration)
            except Exception:
                current_duration = 0.0
            continue

        if line.startswith("#"):
            continue

        if current_time is None:
            continue

        segment_path = os.path.join(replay_dir, line)

        if os.path.exists(segment_path):
            segments.append({
                "path": segment_path,
                "start": current_time,
                "end": current_time + max(current_duration, 0.001),
            })

        current_time = None
        current_duration = 0.0

    if not segments:
        raise HTTPException(
            status_code=404,
            detail="No timestamped replay segments found",
        )

    # EXT-X-PROGRAM-DATE-TIME may follow delayed source timestamps,
    # while segment mtimes reflect their real arrival time.
    #
    # Align dynamically when the difference is significant.
    try:
        latest_segment = segments[-1]
        latest_file_time = os.path.getmtime(
            latest_segment["path"]
        )
        latest_playlist_end = float(
            latest_segment["end"]
        )

        timestamp_offset = (
            latest_file_time - latest_playlist_end
        )

        if abs(timestamp_offset) >= 5:
            for item in segments:
                item["start"] += timestamp_offset
                item["end"] += timestamp_offset

    except Exception:
        timestamp_offset = 0.0

    event_time = int(event_timestamp_ms) / 1000.0
    window_start = event_time - max(
        0,
        int(seconds_before),
    )
    window_end = event_time + max(
        0,
        int(seconds_after),
    )

    picked = [
        item["path"]
        for item in segments
        if item["end"] >= window_start and item["start"] <= window_end
    ]

    if not picked:
        oldest = segments[0]["start"]
        newest = segments[-1]["end"]

        raise HTTPException(
            status_code=404,
            detail=(
                "Event timestamp is outside replay buffer "
                f"(event={event_time:.3f}, buffer={oldest:.3f}-{newest:.3f})"
            ),
        )

    return picked


def _latest_segments_for_source(source: str, seconds: int) -> list[str]:
    replay_dir = os.path.join(REPLAY_ROOT, source)
    files = sorted(glob.glob(os.path.join(replay_dir, "seg_*.ts")))

    if not files:
        files = sorted(glob.glob(os.path.join(HLS_ROOT, f"{source}-*.ts")))

    if not files:
        raise HTTPException(status_code=404, detail="Replay segments not found")

    take = max(1, min(int(seconds), 120))
    picked = files[-take:]
    if not picked:
        raise HTTPException(status_code=404, detail="Replay window empty")
    return picked


def _cleanup_temp_output(out_path: str, temp_dir: str):
    try:
        if out_path and os.path.exists(out_path):
            os.remove(out_path)
    except Exception:
        pass
    try:
        if temp_dir and os.path.isdir(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        pass


def _build_replay_mp4(source: str, seconds: int) -> tuple[str, str]:
    segs = _latest_segments_for_source(source, seconds)

    ffmpeg = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
    if not os.path.exists(ffmpeg):
        raise HTTPException(status_code=500, detail="ffmpeg not found")

    temp_dir = tempfile.mkdtemp(prefix="replay_build_")
    list_path = os.path.join(temp_dir, "concat.txt")
    out_path = os.path.join(temp_dir, f"{source}_{seconds}s.mp4")

    try:
        with open(list_path, "w", encoding="utf-8") as f:
            for p in segs:
                f.write(f"file '{p}'\n")

        cmd_copy = [
            ffmpeg,
            "-hide_banner",
            "-loglevel", "error",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_path,
            "-an",
            "-c:v", "copy",
            "-movflags", "+faststart",
            out_path,
        ]
        p1 = subprocess.run(cmd_copy, capture_output=True, text=True, timeout=30)

        if p1.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) < 50000:
            cmd_reencode = [
                ffmpeg,
                "-hide_banner",
                "-loglevel", "error",
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_path,
                "-an",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                out_path,
            ]
            p2 = subprocess.run(cmd_reencode, capture_output=True, text=True, timeout=60)
            if p2.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) < 50000:
                err = (p2.stderr or p1.stderr or "ffmpeg failed").strip()
                raise HTTPException(status_code=500, detail=err[:300])

        return out_path, temp_dir

    except subprocess.TimeoutExpired:
        _cleanup_temp_output(out_path, temp_dir)
        raise HTTPException(status_code=500, detail="Replay ffmpeg timeout")
    except HTTPException:
        _cleanup_temp_output(out_path, temp_dir)
        raise
    except Exception as e:
        _cleanup_temp_output(out_path, temp_dir)
        raise HTTPException(status_code=500, detail=str(e)[:300])


@app.on_event("startup")
def _startup():
    global API_KEY
    API_KEY = ensure_api_key()
    os.makedirs(MEDIA_DIR, exist_ok=True)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/key-info")
def key_info():
    return {
        "ok": True,
        "keyStoredAt": API_KEY_PATH,
        "hint": "Use header X-API-Key with your secret key (server-side file).",
    }


@app.get("/api/state")
def get_state():
    if not os.path.exists(STATE_PATH):
        return {
            "ok": True,
            "updatedAt": "",
            "court": "Court 1",
            "status": "waiting for data",
            "bestOf": 3,
            "playerA": {"name": "Player A", "photo": "", "sets": 0, "games": 0, "points": "0", "serve": False},
            "playerB": {"name": "Player B", "photo": "", "sets": 0, "games": 0, "points": "0", "serve": False},
            "inTiebreak": False,
            "tiebreakA": 0,
            "tiebreakB": 0,
        }
    with open(STATE_PATH, "r") as f:
        return json.load(f)


@app.post("/api/state")
def set_state(payload: State, x_api_key: str = Header(default="")):
    _require_key(x_api_key)

    data = payload.dict()
    if not data.get("updatedAt"):
        data["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    atomic_write(STATE_PATH, data)
    return {"ok": True}


event_store = EventStore("/opt/tennislive-score/data/events")


def _build_replay_mp4_from_segments(
    source: str,
    segments: list[str],
    output_tag: str,
) -> tuple[str, str]:
    if not segments:
        raise HTTPException(
            status_code=404,
            detail="Replay window empty",
        )

    ffmpeg = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"

    if not os.path.exists(ffmpeg):
        raise HTTPException(
            status_code=500,
            detail="ffmpeg not found",
        )

    temp_dir = tempfile.mkdtemp(prefix="replay_event_")
    list_path = os.path.join(temp_dir, "concat.txt")
    safe_tag = _safe_id(str(output_tag or "event"))
    out_path = os.path.join(
        temp_dir,
        f"{source}_{safe_tag}.mp4",
    )

    try:
        with open(list_path, "w", encoding="utf-8") as f:
            for segment in segments:
                f.write(f"file '{segment}'\n")

        cmd_copy = [
            ffmpeg,
            "-hide_banner",
            "-loglevel", "error",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_path,
            "-an",
            "-c:v", "copy",
            "-movflags", "+faststart",
            out_path,
        ]

        first = subprocess.run(
            cmd_copy,
            capture_output=True,
            text=True,
            timeout=30,
        )

        if (
            first.returncode != 0
            or not os.path.exists(out_path)
            or os.path.getsize(out_path) < 50000
        ):
            cmd_reencode = [
                ffmpeg,
                "-hide_banner",
                "-loglevel", "error",
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_path,
                "-an",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                out_path,
            ]

            second = subprocess.run(
                cmd_reencode,
                capture_output=True,
                text=True,
                timeout=60,
            )

            if (
                second.returncode != 0
                or not os.path.exists(out_path)
                or os.path.getsize(out_path) < 50000
            ):
                error = (
                    second.stderr
                    or first.stderr
                    or "ffmpeg failed"
                ).strip()

                raise HTTPException(
                    status_code=500,
                    detail=error[:300],
                )

        return out_path, temp_dir

    except subprocess.TimeoutExpired:
        _cleanup_temp_output(out_path, temp_dir)
        raise HTTPException(
            status_code=500,
            detail="Replay ffmpeg timeout",
        )
    except HTTPException:
        _cleanup_temp_output(out_path, temp_dir)
        raise
    except Exception as error:
        _cleanup_temp_output(out_path, temp_dir)
        raise HTTPException(
            status_code=500,
            detail=str(error)[:300],
        )


def _generate_event_thumbnail(
    clip_path: str,
    thumbnail_path: str,
) -> None:
    """
    Creates one cached JPEG thumbnail from an event MP4.

    The event normally occurs near the end of a clip containing
    30 seconds before and 2 seconds after the scoring event.
    """
    ffmpeg = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"

    if not os.path.exists(ffmpeg):
        raise HTTPException(
            status_code=500,
            detail="ffmpeg not found",
        )

    os.makedirs(
        os.path.dirname(thumbnail_path),
        exist_ok=True,
    )

    temp_path = thumbnail_path + ".tmp.jpg"

    def run_at(second: int):
        return subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel", "error",
                "-y",
                "-ss", str(second),
                "-i", clip_path,
                "-frames:v", "1",
                "-vf", "scale=640:-2",
                "-q:v", "4",
                temp_path,
            ],
            capture_output=True,
            text=True,
            timeout=20,
        )

    try:
        result = run_at(28)

        # Fallback για μικρότερα ή ασυνήθιστα clips.
        if (
            result.returncode != 0
            or not os.path.exists(temp_path)
            or os.path.getsize(temp_path) < 2000
        ):
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            except Exception:
                pass

            result = run_at(1)

        if (
            result.returncode != 0
            or not os.path.exists(temp_path)
            or os.path.getsize(temp_path) < 2000
        ):
            raise HTTPException(
                status_code=500,
                detail=(
                    result.stderr
                    or "Unable to create event thumbnail"
                )[:300],
            )

        os.replace(temp_path, thumbnail_path)

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=500,
            detail="Thumbnail ffmpeg timeout",
        )

    finally:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass


@app.get("/api/events/{event_id}/thumbnail")
def get_event_thumbnail(event_id: str):
    event = event_store.get_event(event_id)

    if not event:
        raise HTTPException(
            status_code=404,
            detail="Event not found",
        )

    match_id = str(
        event.get("matchId") or ""
    ).strip()

    if not match_id:
        raise HTTPException(
            status_code=404,
            detail="Event has no saved match clip",
        )

    safe_match_id = _safe_id(match_id)
    safe_event_id = _safe_id(event_id)

    clip_path = os.path.join(
        EVENT_CLIPS_ROOT,
        safe_match_id,
        f"{safe_event_id}.mp4",
    )

    if (
        not os.path.exists(clip_path)
        or os.path.getsize(clip_path) < 50000
    ):
        raise HTTPException(
            status_code=404,
            detail="Saved event clip not found",
        )

    thumbnail_path = os.path.join(
        EVENT_THUMBNAILS_ROOT,
        safe_match_id,
        f"{safe_event_id}.jpg",
    )

    if (
        not os.path.exists(thumbnail_path)
        or os.path.getsize(thumbnail_path) < 2000
        or os.path.getmtime(thumbnail_path)
            < os.path.getmtime(clip_path)
    ):
        _generate_event_thumbnail(
            clip_path,
            thumbnail_path,
        )

    return FileResponse(
        thumbnail_path,
        media_type="image/jpeg",
        filename=f"event_{event_id}.jpg",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Thumbnail-Source": "event-clip",
        },
    )


@app.get("/api/events/{event_id}/replay")
def get_event_replay(event_id: str):
    event = event_store.get_event(event_id)

    if not event:
        raise HTTPException(
            status_code=404,
            detail="Event not found",
        )

    match_id = str(event.get("matchId") or "").strip()

    if match_id:
        safe_match_id = _safe_id(match_id)
        safe_event_id = _safe_id(event_id)

        saved_clip = os.path.join(
            EVENT_CLIPS_ROOT,
            safe_match_id,
            f"{safe_event_id}.mp4",
        )

        if (
            os.path.exists(saved_clip)
            and os.path.getsize(saved_clip) >= 50000
        ):
            return FileResponse(
                saved_clip,
                media_type="video/mp4",
                filename=f"event_{event_id}.mp4",
                headers={
                    "X-Replay-Source": "saved-clip",
                    "Cache-Control": "private, max-age=300",
                },
            )

    court_id = str(event.get("courtId") or "").strip()
    timestamp_ms = int(event.get("timestamp") or 0)
    metadata = event.get("metadata") or {}
    replay = metadata.get("replay") or {}

    cam = str(replay.get("cam") or "cam1")
    seconds_before = max(
        0,
        min(int(replay.get("secondsBefore") or 30), 120),
    )
    seconds_after = max(
        0,
        min(int(replay.get("secondsAfter") or 2), 30),
    )

    if not court_id or timestamp_ms <= 0:
        raise HTTPException(
            status_code=400,
            detail="Event has invalid replay metadata",
        )

    source = _pick_replay_source(court_id, cam)

    segments = _segments_for_timestamp(
        source=source,
        event_timestamp_ms=timestamp_ms,
        seconds_before=seconds_before,
        seconds_after=seconds_after,
    )

    out_path, temp_dir = _build_replay_mp4_from_segments(
        source=source,
        segments=segments,
        output_tag=event_id,
    )

    return FileResponse(
        out_path,
        media_type="video/mp4",
        filename=f"event_{event_id}.mp4",
        headers={
            "X-Replay-Source": "live-buffer",
            "Cache-Control": "no-store",
        },
        background=BackgroundTask(
            _cleanup_temp_output,
            out_path,
            temp_dir,
        ),
    )


@app.get("/api/replay/by-timestamp")
def get_replay_by_timestamp(
    courtId: str = Query(...),
    timestampMs: int = Query(...),
    secondsBefore: int = Query(30),
    secondsAfter: int = Query(2),
    cam: str = Query("cam1"),
):
    secondsBefore = max(0, min(int(secondsBefore), 120))
    secondsAfter = max(0, min(int(secondsAfter), 30))

    source = _pick_replay_source(courtId, cam)
    segs = _segments_for_timestamp(
        source=source,
        event_timestamp_ms=timestampMs,
        seconds_before=secondsBefore,
        seconds_after=secondsAfter,
    )

    ffmpeg = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
    if not os.path.exists(ffmpeg):
        raise HTTPException(status_code=500, detail="ffmpeg not found")

    temp_dir = tempfile.mkdtemp(prefix="replay_event_")
    list_path = os.path.join(temp_dir, "concat.txt")
    out_path = os.path.join(
        temp_dir,
        f"{source}_{timestampMs}.mp4",
    )

    try:
        with open(list_path, "w", encoding="utf-8") as f:
            for segment in segs:
                f.write(f"file '{segment}'\n")

        cmd = [
            ffmpeg,
            "-hide_banner",
            "-loglevel", "error",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_path,
            "-an",
            "-c:v", "copy",
            "-movflags", "+faststart",
            out_path,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )

        if (
            result.returncode != 0
            or not os.path.exists(out_path)
            or os.path.getsize(out_path) < 50000
        ):
            raise HTTPException(
                status_code=500,
                detail=(result.stderr or "ffmpeg failed")[:300],
            )

        return FileResponse(
            out_path,
            media_type="video/mp4",
            filename=f"event_replay_{timestampMs}.mp4",
            background=BackgroundTask(
                _cleanup_temp_output,
                out_path,
                temp_dir,
            ),
        )

    except subprocess.TimeoutExpired:
        _cleanup_temp_output(out_path, temp_dir)
        raise HTTPException(
            status_code=500,
            detail="Replay ffmpeg timeout",
        )
    except HTTPException:
        _cleanup_temp_output(out_path, temp_dir)
        raise
    except Exception as e:
        _cleanup_temp_output(out_path, temp_dir)
        raise HTTPException(
            status_code=500,
            detail=str(e)[:300],
        )


@app.get("/api/replay")
def get_replay(
    courtId: str = Query(...),
    seconds: int = Query(30),
    cam: str = Query("cam1"),
):
    seconds = max(3, min(int(seconds), 60))
    source = _pick_replay_source(courtId, cam)
    out_path, temp_dir = _build_replay_mp4(source, seconds)

    return FileResponse(
        out_path,
        media_type="video/mp4",
        filename=f"replay_{source}_{seconds}s.mp4",
        background=BackgroundTask(_cleanup_temp_output, out_path, temp_dir),
    )


@app.post("/api/upload/photo")
async def upload_photo(
    x_api_key: str = Header(default=""),
    court: str = Form("court1"),
    player: str = Form(...),
    file: UploadFile = File(...),
):
    _require_key(x_api_key)

    p = (player or "").strip().upper()
    if p not in ("A", "B"):
        raise HTTPException(status_code=400, detail="player must be A or B")

    ct = (file.content_type or "").lower()
    if ct not in ("image/jpeg", "image/jpg", "image/png", "application/octet-stream"):
        raise HTTPException(status_code=400, detail=f"unsupported content-type: {file.content_type}")

    court_id = _safe_id(court)
    os.makedirs(MEDIA_DIR, exist_ok=True)

    ext = ".jpg"
    if ct == "image/png":
        ext = ".png"

    filename = f"{court_id}_{p}{ext}"
    path = os.path.join(MEDIA_DIR, filename)

    fd, tmp = tempfile.mkstemp(prefix="up_", suffix=ext, dir=MEDIA_DIR)
    try:
        data = await file.read()
        if not data or len(data) < 100:
            raise HTTPException(status_code=400, detail="empty file")

        with os.fdopen(fd, "wb") as f:
            f.write(data)

        os.replace(tmp, path)

        # ===== VC MATCH PHOTO STAGING V1 =====
        try:
            import shutil

            staging_dir = os.path.join(
                MEDIA_DIR,
                ".match-staging"
            )

            os.makedirs(
                staging_dir,
                exist_ok=True
            )

            # Remove the previous format so JPG/PNG
            # cannot conflict with one another.
            for old_ext in (".jpg", ".png"):
                old_path = os.path.join(
                    staging_dir,
                    f"{court_id}_{p}{old_ext}"
                )

                if os.path.exists(old_path):
                    try:
                        os.remove(old_path)
                    except Exception:
                        pass

            staging_path = os.path.join(
                staging_dir,
                f"{court_id}_{p}{ext}"
            )

            shutil.copy2(
                path,
                staging_path
            )

        except Exception as staging_error:
            print(
                "PHOTO STAGING ERROR:",
                staging_error
            )
        # ===== VC MATCH PHOTO STAGING V1 END =====
    finally:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass

    v = int(time.time())
    url = f"{PUBLIC_BASE}/media/{filename}?v={v}"
    return {"ok": True, "url": url, "player": p, "court": court_id}


@app.post("/api/delete/photo")
def delete_photo(
    x_api_key: str = Header(default=""),
    court: str = Form("court1"),
    player: str = Form(...),
):
    _require_key(x_api_key)

    p = (player or "").strip().upper()
    if p not in ("A", "B"):
        raise HTTPException(status_code=400, detail="player must be A or B")

    court_id = _safe_id(court)

    deleted = []
    for ext in (".jpg", ".png"):
        filename = f"{court_id}_{p}{ext}"
        path = os.path.join(MEDIA_DIR, filename)
        if os.path.exists(path):
            try:
                os.remove(path)
                deleted.append(filename)
            except Exception:
                pass

    return {"ok": True, "deleted": deleted, "player": p, "court": court_id}


@app.get("/api/photos")
def get_photos(court: str = Query("court1")):
    court_id = _safe_id(court)

    def pick(p: str) -> str:
        jpg = os.path.join(MEDIA_DIR, f"{court_id}_{p}.jpg")
        png = os.path.join(MEDIA_DIR, f"{court_id}_{p}.png")
        if os.path.exists(jpg):
            return f"{PUBLIC_BASE}/media/{court_id}_{p}.jpg?v={int(os.path.getmtime(jpg))}"
        if os.path.exists(png):
            return f"{PUBLIC_BASE}/media/{court_id}_{p}.png?v={int(os.path.getmtime(png))}"
        return ""

    return {"ok": True, "court": court_id, "playerA": pick("A"), "playerB": pick("B")}


MATCHES_PATH = "/var/www/tennislive/matches.json"


def load_matches():
    if not os.path.exists(MATCHES_PATH):
        return []
    try:
        with open(MATCHES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def atomic_write_list(path: str, items: list):
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="matches_", suffix=".json", dir=d)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, path)
    finally:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass


@app.post("/api/matches")
def submit_match(payload: dict, x_api_key: str = Header(default="")):
    _require_key(x_api_key)

    items = load_matches()
    items.insert(0, payload)
    items = items[:1000]

    atomic_write_list(MATCHES_PATH, items)
    return {"ok": True, "count": len(items)}


@app.get("/api/matches")
def get_matches(limit: int = Query(100), courtKey: str = Query("")):
    items = load_matches()

    if courtKey.strip():
        items = [x for x in items if str(x.get("courtKey", "")).strip() == courtKey.strip()]

    limit = max(1, min(limit, 100))
    return {
        "ok": True,
        "count": len(items[:limit]),
        "items": items[:limit]
    }


from state_routes import mount_state_api
mount_state_api(app)

from score_actions import mount_score_actions
mount_score_actions(app)

from sse_routes import mount_sse_api
mount_sse_api(app)

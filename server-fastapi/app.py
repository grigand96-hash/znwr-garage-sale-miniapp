"""
ZNWR Arcade Sale — backend (FastAPI + SQLite).

Faithful port of the Apps Script logger so the frontend only swaps its endpoint
URL. Built to survive the sale's 10-30k players with launch spikes that would
break Apps Script (no 30-execution cap, no cell limit, local SQLite writes).

Contract (mirrors the old Apps Script API):
  POST  /                          body=JSON event          -> {"ok": true}
  GET   /?action=rating&limit=30                            -> {"ok": true, "players": [...] (hashed keys)}
  GET   /?action=draw&secret=...                            -> {"ok": true, "count": n, "players": [...] (raw tg keys)}
  GET   /health                                             -> {"ok": true}

Secrets come from the environment (never committed):
  BOT_TOKEN     Telegram bot token for initData HMAC verification
  DRAW_SECRET   guards the /?action=draw endpoint
  DB_PATH       SQLite file (default ./sale.db)
"""
import hashlib
import hmac
import json
import os
import sqlite3
import threading
import time
from urllib.parse import unquote

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
DRAW_SECRET = os.environ.get("DRAW_SECRET", "")
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "sale.db"))

PUBLIC_KEY_SALT = "znwr-arcade:"
RATE_LIMIT_PER_MINUTE = 60
TELEGRAM_AUTH_MAX_AGE_SECONDS = 86400

SHARE_BONUS_POINTS = 625
SHARE_BONUS_DECAY = 0.5
SHARE_BONUS_MAX_PER_SOURCE = 6
MAX_SCORE_MULTIPLIER = 12

GAME_TYPES = ("pac", "invaders", "breakout")
GAME_LABELS = {"pac": "PAC SALE", "invaders": "CODE INVADERS", "breakout": "PROMO BREAKOUT"}
GAME_SETTINGS = {"pac": (24, 1.0), "invaders": (10, 1.12), "breakout": (18, 1.06)}

RATING_EVENTS = {"rating_result", "share_bonus", "telegram_share_confirmed", "instagram_story_mention"}

# ---------------------------------------------------------------------------
# Storage — SQLite in WAL mode. Reads run concurrently; the single writer is
# serialised by a lock so upserts never race. Sub-millisecond per op locally.
# ---------------------------------------------------------------------------
_write_lock = threading.Lock()


def _connect():
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


def init_db():
    with _connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS rating (
                player_key TEXT PRIMARY KEY,
                name TEXT, telegram_user_id TEXT, telegram_username TEXT,
                pac_rating INTEGER DEFAULT 0, pac_seconds INTEGER DEFAULT 0,
                invaders_rating INTEGER DEFAULT 0, invaders_seconds INTEGER DEFAULT 0,
                breakout_rating INTEGER DEFAULT 0, breakout_seconds INTEGER DEFAULT 0,
                total_rating INTEGER DEFAULT 0, games_done INTEGER DEFAULT 0,
                best_game TEXT DEFAULT '', total_seconds INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT '',
                share_count INTEGER DEFAULT 0,
                telegram_share_count INTEGER DEFAULT 0,
                instagram_share_count INTEGER DEFAULT 0,
                share_points INTEGER DEFAULT 0
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_time TEXT, event TEXT, session_id TEXT,
                telegram_verified TEXT, telegram_user_id TEXT, telegram_username TEXT,
                game_type TEXT, result_score INTEGER, result_seconds INTEGER,
                total_rating INTEGER, share_source TEXT, src TEXT, user_agent TEXT
            )"""
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rating_total ON rating(total_rating DESC)")


# ---------------------------------------------------------------------------
# Telegram initData verification (signature-tolerant, matches the Apps Script)
# ---------------------------------------------------------------------------
def verify_init_data(init_data: str, bot_token: str):
    if not bot_token:
        return False, "no_bot_token", {}
    if not init_data:
        return False, "no_init_data", {}
    params = {}
    for pair in init_data.split("&"):
        i = pair.find("=")
        if i == -1:
            continue
        params[unquote(pair[:i])] = unquote(pair[i + 1:])
    provided = params.get("hash")
    if not provided:
        return False, "no_hash", {}

    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()

    def hash_for(excluded):
        dcs = "\n".join(f"{k}={params[k]}" for k in sorted(params) if k not in excluded)
        return hmac.new(secret_key, dcs.encode(), hashlib.sha256).hexdigest()

    # Telegram's HMAC always excludes `hash`; newer clients also send `signature`
    # and conventions differ on whether it stays in the check string. Accept
    # either — both still require a valid bot-token HMAC, so no forgery slips in.
    valid = hmac.compare_digest(hash_for({"hash"}), provided)
    if not valid and params.get("signature"):
        valid = hmac.compare_digest(hash_for({"hash", "signature"}), provided)
    if not valid:
        return False, "bad_hash", {}

    auth_date = int(params.get("auth_date") or 0)
    if not auth_date:
        return False, "no_auth_date", {}
    age = int(time.time()) - auth_date
    if age < -60 or age > TELEGRAM_AUTH_MAX_AGE_SECONDS:
        return False, "expired_auth_date", {}

    try:
        user = json.loads(params["user"]) if params.get("user") else {}
    except (ValueError, KeyError):
        return False, "bad_user", {}
    if not user.get("id"):
        return False, "no_user", {}
    return True, "ok", user


# ---------------------------------------------------------------------------
# Scoring (identical math to the client + Apps Script)
# ---------------------------------------------------------------------------
def public_key(raw_key: str) -> str:
    if not raw_key:
        return ""
    digest = hashlib.sha256((PUBLIC_KEY_SALT + raw_key).encode()).digest()
    return "h:" + digest[:6].hex()


def mask_name(name: str) -> str:
    # Public leaderboard hides full identities: @grigand -> @gri***. The private
    # draw endpoint keeps full names so the winner can actually be contacted.
    name = (name or "PLAYER").strip()
    if name.startswith("@"):
        handle = name[1:]
        return "@" + (handle[:3] if len(handle) > 3 else handle) + "***"
    return (name[:3] if len(name) > 3 else name) + "***"


def game_rating(raw_score, game_type: str) -> int:
    settings = GAME_SETTINGS.get(game_type)
    if not settings:
        return 0
    target, coef = settings
    try:
        score = int(float(raw_score or 0))
    except (TypeError, ValueError):
        return 0
    if score < target:
        return 0
    capped = min(score, target * MAX_SCORE_MULTIPLIER)
    full = capped // target
    partial = (capped - full * target) / target
    weight = sum(1.0 / k for k in range(1, full + 1)) + partial / (full + 1)
    return round(weight * 1000 * coef)


def share_points_for(count) -> int:
    capped = min(max(int(count or 0), 0), SHARE_BONUS_MAX_PER_SOURCE)
    return sum(round(SHARE_BONUS_POINTS * (SHARE_BONUS_DECAY ** i)) for i in range(capped))


# ---------------------------------------------------------------------------
# Rate limiting — in-memory sliding window per identity (per worker).
# ---------------------------------------------------------------------------
_rl_lock = threading.Lock()
_rl = {}


def rate_limited(identity: str) -> bool:
    if not identity:
        return False
    now = int(time.time())
    window = now // 60
    with _rl_lock:
        key = (identity, window)
        count = _rl.get(key, 0) + 1
        _rl[key] = count
        if len(_rl) > 20000:  # cheap GC of old windows
            for k in [k for k in _rl if k[1] < window]:
                _rl.pop(k, None)
    return count > RATE_LIMIT_PER_MINUTE


def player_key(payload) -> str:
    if payload.get("telegram_user_id"):
        return f"tg:{payload['telegram_user_id']}"
    if payload.get("session_id"):
        return f"anon:{payload['session_id']}"
    return ""


def player_name(payload, fallback) -> str:
    if payload.get("telegram_username"):
        return f"@{payload['telegram_username']}"
    if payload.get("telegram_first_name"):
        return str(payload["telegram_first_name"])
    return fallback or "PLAYER"


# ---------------------------------------------------------------------------
# Rating upsert
# ---------------------------------------------------------------------------
def apply_rating_event(payload):
    key = player_key(payload)
    # Only Telegram players enter the rating (anons can't be reached for the
    # prize and their session key regenerates every load — the bloat vector).
    if not key.startswith("tg:"):
        return
    with _write_lock, _connect() as conn:
        row = conn.execute("SELECT * FROM rating WHERE player_key = ?", (key,)).fetchone()
        rec = dict(row) if row else {
            "player_key": key, "name": "PLAYER", "telegram_user_id": "", "telegram_username": "",
            "pac_rating": 0, "pac_seconds": 0, "invaders_rating": 0, "invaders_seconds": 0,
            "breakout_rating": 0, "breakout_seconds": 0,
            "telegram_share_count": 0, "instagram_share_count": 0,
        }
        rec["name"] = player_name(payload, rec.get("name"))
        rec["telegram_user_id"] = str(payload.get("telegram_user_id") or rec.get("telegram_user_id") or "")
        rec["telegram_username"] = str(payload.get("telegram_username") or rec.get("telegram_username") or "")

        event = payload.get("event")
        if event in ("share_bonus", "telegram_share_confirmed", "instagram_story_mention"):
            source = payload.get("share_source") or (
                "telegram" if event == "telegram_share_confirmed"
                else "instagram" if event == "instagram_story_mention" else "")
            if source == "telegram":
                rec["telegram_share_count"] = min((rec.get("telegram_share_count") or 0) + 1, SHARE_BONUS_MAX_PER_SOURCE)
            elif source == "instagram":
                rec["instagram_share_count"] = min((rec.get("instagram_share_count") or 0) + 1, SHARE_BONUS_MAX_PER_SOURCE)

        if event == "rating_result":
            gt = str(payload.get("game_type") or "")
            if gt in GAME_TYPES:
                try:
                    seconds = int(float(payload.get("result_seconds") or 0))
                except (TypeError, ValueError):
                    seconds = 0
                if 5 <= seconds <= 1800:
                    rating = game_rating(payload.get("result_score"), gt)
                    best = rec.get(f"{gt}_rating") or 0
                    best_sec = rec.get(f"{gt}_seconds") or 0
                    if rating > best or (rating == best and rating > 0 and seconds < best_sec):
                        rec[f"{gt}_rating"] = rating
                        rec[f"{gt}_seconds"] = seconds

        _recompute_totals(rec)
        conn.execute(
            """INSERT INTO rating (player_key, name, telegram_user_id, telegram_username,
                pac_rating, pac_seconds, invaders_rating, invaders_seconds,
                breakout_rating, breakout_seconds, total_rating, games_done, best_game,
                total_seconds, updated_at, share_count, telegram_share_count,
                instagram_share_count, share_points)
               VALUES (:player_key,:name,:telegram_user_id,:telegram_username,
                :pac_rating,:pac_seconds,:invaders_rating,:invaders_seconds,
                :breakout_rating,:breakout_seconds,:total_rating,:games_done,:best_game,
                :total_seconds,:updated_at,:share_count,:telegram_share_count,
                :instagram_share_count,:share_points)
               ON CONFLICT(player_key) DO UPDATE SET
                name=excluded.name, telegram_user_id=excluded.telegram_user_id,
                telegram_username=excluded.telegram_username,
                pac_rating=excluded.pac_rating, pac_seconds=excluded.pac_seconds,
                invaders_rating=excluded.invaders_rating, invaders_seconds=excluded.invaders_seconds,
                breakout_rating=excluded.breakout_rating, breakout_seconds=excluded.breakout_seconds,
                total_rating=excluded.total_rating, games_done=excluded.games_done,
                best_game=excluded.best_game, total_seconds=excluded.total_seconds,
                updated_at=excluded.updated_at, share_count=excluded.share_count,
                telegram_share_count=excluded.telegram_share_count,
                instagram_share_count=excluded.instagram_share_count,
                share_points=excluded.share_points""",
            rec,
        )


def _recompute_totals(rec):
    played = [gt for gt in GAME_TYPES if (rec.get(f"{gt}_rating") or 0) > 0]
    share_points = share_points_for(rec.get("telegram_share_count")) + share_points_for(rec.get("instagram_share_count"))
    total = (sum(rec[f"{gt}_rating"] for gt in played) + share_points) if played else 0
    rec["share_points"] = share_points
    rec["total_rating"] = total
    rec["games_done"] = len(played)
    rec["total_seconds"] = sum(rec.get(f"{gt}_seconds") or 0 for gt in played)
    rec["share_count"] = (rec.get("telegram_share_count") or 0) + (rec.get("instagram_share_count") or 0)
    best = max(played, key=lambda gt: rec[f"{gt}_rating"], default=None)
    rec["best_game"] = GAME_LABELS[best] if best else ""
    rec["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    for col in ("pac_rating", "pac_seconds", "invaders_rating", "invaders_seconds",
                "breakout_rating", "breakout_seconds", "telegram_share_count", "instagram_share_count"):
        rec.setdefault(col, 0)


def log_event(payload, verified_reason):
    try:
        with _write_lock, _connect() as conn:
            conn.execute(
                """INSERT INTO events (server_time, event, session_id, telegram_verified,
                    telegram_user_id, telegram_username, game_type, result_score,
                    result_seconds, total_rating, share_source, src, user_agent)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), payload.get("event", ""),
                 payload.get("session_id", ""), verified_reason,
                 str(payload.get("telegram_user_id") or ""), str(payload.get("telegram_username") or ""),
                 payload.get("game_type", ""), int(float(payload.get("result_score") or 0)),
                 int(float(payload.get("result_seconds") or 0)), int(float(payload.get("total_rating") or 0)),
                 payload.get("share_source", ""), payload.get("src", ""), (payload.get("user_agent", "") or "")[:300]),
            )
    except Exception:
        pass  # analytics logging must never break an event


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="ZNWR Arcade Sale backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
init_db()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/")
async def ingest(request: Request):
    # Frontend posts JSON with Content-Type text/plain (no-cors), so read raw.
    try:
        payload = json.loads(await request.body() or b"{}")
    except Exception:
        return JSONResponse({"ok": False, "error": "bad_json"})

    verified, reason, user = verify_init_data(payload.get("telegram_init_data", ""), BOT_TOKEN)
    if verified:
        # Trust the signed identity, not client-supplied fields (anti-spoof).
        payload["telegram_user_id"] = user.get("id", "")
        payload["telegram_username"] = user.get("username", "")
        payload["telegram_first_name"] = user.get("first_name", "")
        payload["telegram_last_name"] = user.get("last_name", "")

    identity = f"tg:{user.get('id')}" if verified else (payload.get("session_id") or "")
    if rate_limited(identity):
        return JSONResponse({"ok": False, "error": "rate_limited"})

    log_event(payload, reason if verified else reason)

    event = payload.get("event", "")
    if event in RATING_EVENTS:
        # With a bot token configured, only signed events may enter the rating.
        if not (BOT_TOKEN and not verified):
            try:
                apply_rating_event(payload)
            except Exception:
                pass
    return JSONResponse({"ok": True})


@app.get("/")
def read(action: str = "rating", limit: int = 10, secret: str = ""):
    if action == "draw":
        return _draw(secret)
    return _leaderboard(limit)


def _leaderboard(limit):
    limit = max(1, min(int(limit or 10), 200))
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM rating WHERE total_rating > 0 "
            "ORDER BY total_rating DESC, games_done DESC, total_seconds ASC LIMIT ?",
            (limit,),
        ).fetchall()
    players = [{
        "key": public_key(r["player_key"]),
        "name": mask_name(r["name"]),
        "rating": r["total_rating"] or 0,
        "gamesDone": r["games_done"] or 0,
        "bestGame": r["best_game"] or GAME_LABELS["pac"],
        "totalSeconds": r["total_seconds"] or 0,
        "chance": 1,
    } for r in rows]
    return JSONResponse({"ok": True, "players": players})


def _draw(secret):
    if not DRAW_SECRET:
        return JSONResponse({"ok": False, "error": "draw_secret_not_configured"})
    if secret != DRAW_SECRET:
        return JSONResponse({"ok": False, "error": "forbidden"})
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM rating WHERE total_rating > 0 "
            "ORDER BY total_rating DESC, games_done DESC, total_seconds ASC"
        ).fetchall()
    players = [{
        "key": r["player_key"],
        "name": r["name"] or "PLAYER",
        "userId": r["telegram_user_id"] or "",
        "username": r["telegram_username"] or "",
        "rating": r["total_rating"] or 0,
        "gamesDone": r["games_done"] or 0,
        "bestGame": r["best_game"] or GAME_LABELS["pac"],
        "totalSeconds": r["total_seconds"] or 0,
    } for r in rows]
    return JSONResponse({"ok": True, "guarded": True, "count": len(players), "players": players})

#!/usr/bin/env python3
"""
ZNWR Arcade Sale — рассылка пуш-сообщений игрокам через бота @znwrrr_bot.

Пуш в Telegram Mini App = обычное сообщение от бота в личку. Право писать есть
для всех, кто запускал бота (а игру открывают именно через него).

ПРЕДОХРАНИТЕЛИ (чтобы не спамить и не выстрелить случайно):
  • не более 1 боевой рассылки в сутки (лог в таблице push_log);
  • боевая рассылка только в окно сейла 10–12 июля;
  • боевой запуск требует явного флага --confirm;
  • отправка с паузами (~20/сек), корректная обработка блокировок и 429.

Запуск НА VPS (токен берётся из /opt/znwr-sale/.env):
  python push.py --dry --audience all --file msg.txt        # репетиция (ничего не шлёт)
  python push.py --test 2729672 --file msg.txt              # тест одному чату (в обход окна/лимита)
  python push.py --audience all --file msg.txt --confirm    # БОЕВАЯ рассылка
Аудитории: all (все, кто открывал игру) | players (кто в рейтинге).
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import urllib.request
import urllib.error
from datetime import date, datetime, timezone

DB_PATH = os.environ.get("DB_PATH", "/opt/znwr-sale/data/sale.db")
BOT_TOKEN = os.environ.get("BOT_TOKEN", "")
SALE_START = date(2026, 7, 10)
SALE_END = date(2026, 7, 12)          # включительно
SEND_PACE_SEC = 0.05                   # ~20 сообщений/сек

API = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"


def load_env_file(path="/opt/znwr-sale/.env"):
    # На VPS токен лежит в .env — подхватим, если не в окружении.
    global BOT_TOKEN, API
    if BOT_TOKEN:
        return
    try:
        with open(path) as f:
            for line in f:
                if line.startswith("BOT_TOKEN="):
                    BOT_TOKEN = line.split("=", 1)[1].strip()
    except OSError:
        pass
    API = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS push_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sent_date TEXT, audience TEXT, text TEXT,
        sent INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, ts TEXT
    )""")
    return conn


def audience_ids(conn, audience):
    if audience == "players":
        rows = conn.execute(
            "SELECT DISTINCT telegram_user_id FROM rating WHERE telegram_user_id <> ''"
        ).fetchall()
    else:  # all — все, кто открывал игру с валидной подписью
        rows = conn.execute(
            "SELECT DISTINCT telegram_user_id FROM events "
            "WHERE telegram_user_id <> '' AND telegram_verified = 'ok'"
        ).fetchall()
    return [str(r[0]) for r in rows if str(r[0]).strip()]


def send_one(chat_id, text):
    body = json.dumps({
        "chat_id": chat_id, "text": text,
        "parse_mode": "HTML", "disable_web_page_preview": True,
    }).encode()
    req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return True, 0
    except urllib.error.HTTPError as e:
        # 429 — превышен темп: вернём retry_after, чтобы притормозить.
        if e.code == 429:
            try:
                info = json.loads(e.read())
                return False, int(info.get("parameters", {}).get("retry_after", 2))
            except Exception:
                return False, 2
        return False, 0        # 403 (заблокировал бота) и прочее — просто пропускаем
    except Exception:
        return False, 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audience", choices=["all", "players"], default="all")
    ap.add_argument("--text", default="")
    ap.add_argument("--file", default="")
    ap.add_argument("--dry", action="store_true", help="репетиция, ничего не шлёт")
    ap.add_argument("--test", default="", help="chat_id для одного тестового сообщения")
    ap.add_argument("--confirm", action="store_true", help="подтверждение боевой рассылки")
    args = ap.parse_args()

    load_env_file()
    if not BOT_TOKEN:
        sys.exit("Нет BOT_TOKEN (ни в окружении, ни в .env).")

    text = open(args.file, encoding="utf-8").read().strip() if args.file else args.text
    if not text:
        sys.exit("Пустой текст. Задай --text или --file.")

    today = datetime.now(timezone.utc).date()

    # --- Тест: один чат, в обход окна/лимита ---
    if args.test:
        print(f"ТЕСТ → chat {args.test}")
        ok, _ = send_one(args.test, text)
        print("✅ отправлено" if ok else "❌ не доставлено (не запускал бота / заблокировал?)")
        return

    conn = connect()
    ids = audience_ids(conn, args.audience)
    print(f"Аудитория '{args.audience}': {len(ids)} игроков")
    print("─" * 40)
    print(text)
    print("─" * 40)

    if args.dry:
        print(f"РЕПЕТИЦИЯ (--dry): реально отправлено бы {len(ids)} сообщений. Ничего не послано.")
        return

    # --- Предохранители для боевой рассылки ---
    if not (SALE_START <= today <= SALE_END):
        sys.exit(f"⛔ Сегодня {today} — вне окна сейла {SALE_START}…{SALE_END}. Боевая рассылка запрещена. "
                 f"(для превью используй --test <chat_id>)")
    already = conn.execute("SELECT count(*) FROM push_log WHERE sent_date=? AND sent>0",
                           (today.isoformat(),)).fetchone()[0]
    if already:
        sys.exit(f"⛔ Сегодня ({today}) пуш уже отправляли. Лимит — 1 в день.")
    if not args.confirm:
        sys.exit("⛔ Боевая рассылка требует флага --confirm. Сначала прогони --dry.")

    print(f"Шлём {len(ids)} игрокам…")
    sent = failed = 0
    for i, cid in enumerate(ids, 1):
        ok, backoff = send_one(cid, text)
        if ok:
            sent += 1
        else:
            failed += 1
            if backoff:
                time.sleep(backoff)
        if i % 100 == 0:
            print(f"  {i}/{len(ids)} · отправлено {sent} · не дошло {failed}")
        time.sleep(SEND_PACE_SEC)

    conn.execute("INSERT INTO push_log (sent_date,audience,text,sent,failed,ts) VALUES (?,?,?,?,?,?)",
                 (today.isoformat(), args.audience, text[:200], sent, failed,
                  datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")))
    conn.commit()
    print(f"ГОТОВО: доставлено {sent}, не дошло {failed} (заблокировали/не запускали бота).")


if __name__ == "__main__":
    main()

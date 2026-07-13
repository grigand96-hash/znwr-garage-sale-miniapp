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
Аудитории:
  all      — все, кто открывал игру (валидная подпись)
  players  — кто уже в розыгрыше (есть очки в рейтинге)
  pending  — открывал игру, но в розыгрыш ещё не попал
players и pending непересекающиеся: можно слать обе за один день,
но повтор на одну аудиторию (или any + all) в тот же день блокируется.
"""
import argparse
import http.client
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
        # уже в розыгрыше (есть очки в рейтинге)
        rows = conn.execute(
            "SELECT DISTINCT telegram_user_id FROM rating "
            "WHERE telegram_user_id <> '' AND total_rating > 0"
        ).fetchall()
    elif audience == "pending":
        # открывали игру (валидная подпись), но в розыгрыш ещё не попали
        rows = conn.execute(
            "SELECT DISTINCT telegram_user_id FROM events "
            "WHERE telegram_user_id <> '' AND telegram_verified = 'ok' "
            "AND telegram_user_id NOT IN "
            "(SELECT telegram_user_id FROM rating WHERE total_rating > 0)"
        ).fetchall()
    else:  # all — все, кто открывал игру с валидной подписью
        rows = conn.execute(
            "SELECT DISTINCT telegram_user_id FROM events "
            "WHERE telegram_user_id <> '' AND telegram_verified = 'ok'"
        ).fetchall()
    return [str(r[0]) for r in rows if str(r[0]).strip()]


# Одно постоянное keep-alive соединение на всю рассылку — вместо нового TLS
# на каждое сообщение (это давало ~0.3с overhead и ловило flood-throttle).
_conn = None


def _get_conn():
    global _conn
    if _conn is None:
        _conn = http.client.HTTPSConnection("api.telegram.org", timeout=20)
    return _conn


def _reset_conn():
    global _conn
    try:
        if _conn:
            _conn.close()
    except Exception:
        pass
    _conn = None


def send_one(chat_id, text):
    """Возвращает (ok, backoff). Повтор при 429 делает вызывающий цикл."""
    body = json.dumps({
        "chat_id": chat_id, "text": text,
        "parse_mode": "HTML", "disable_web_page_preview": True,
    }).encode()
    path = f"/bot{BOT_TOKEN}/sendMessage"
    for _ in range(2):                     # +1 реконнект, если соединение порвалось
        try:
            conn = _get_conn()
            conn.request("POST", path, body, {"Content-Type": "application/json"})
            resp = conn.getresponse()
            data = resp.read()             # обязательно вычитать, иначе keep-alive ломается
            if resp.status == 200:
                return True, 0
            if resp.status == 429:
                try:
                    info = json.loads(data)
                    return False, int(info.get("parameters", {}).get("retry_after", 2))
                except Exception:
                    return False, 2
            return False, 0                # 403 (не запускал/заблокировал бота) и пр. — пропуск
        except Exception:
            _reset_conn()                  # соединение оборвалось — пересоздать и повторить один раз
            continue
    return False, 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audience", choices=["all", "players", "pending"], default="all")
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
    # Лимит: один человек — не больше 1 пуша в сутки. Но players и pending
    # непересекающиеся, поэтому обе рассылки в один день допустимы.
    sent_today = [r[0] for r in conn.execute(
        "SELECT DISTINCT audience FROM push_log WHERE sent_date=? AND sent>0",
        (today.isoformat(),)).fetchall()]

    def overlaps(a, b):
        # 'all' содержит всех → пересекается с любой; одинаковые аудитории
        # пересекаются; players и pending — непересекающиеся по построению.
        if a == "all" or b == "all":
            return True
        return a == b

    clash = [a for a in sent_today if overlaps(a, args.audience)]
    if clash:
        sys.exit(f"⛔ Сегодня ({today}) уже слали пуш на {clash}, что пересекается с "
                 f"'{args.audience}'. Один человек — не больше 1 пуша в день.")
    if not args.confirm:
        sys.exit("⛔ Боевая рассылка требует флага --confirm. Сначала прогони --dry.")

    print(f"Шлём {len(ids)} игрокам…", flush=True)
    sent = failed = throttled = 0
    for i, cid in enumerate(ids, 1):
        # 429 = превышен темп: ждём retry_after и шлём ЭТО ЖЕ сообщение снова,
        # чтобы человек не потерялся. До 6 попыток на сообщение.
        for attempt in range(6):
            ok, backoff = send_one(cid, text)
            if ok:
                sent += 1
                break
            if backoff:                       # 429 — притормозить и повторить
                throttled += 1
                time.sleep(backoff + 0.5)
                continue
            failed += 1                        # 403 и пр. — реальный неуспех, пропуск
            break
        else:
            failed += 1                        # исчерпали попытки на 429 — считаем неуспехом
        if i % 50 == 0:
            print(f"  {i}/{len(ids)} · доставлено {sent} · не дошло {failed} · 429-повторов {throttled}",
                  flush=True)
        time.sleep(SEND_PACE_SEC)

    conn.execute("INSERT INTO push_log (sent_date,audience,text,sent,failed,ts) VALUES (?,?,?,?,?,?)",
                 (today.isoformat(), args.audience, text[:200], sent, failed,
                  datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")))
    conn.commit()
    print(f"ГОТОВО: доставлено {sent}, не дошло {failed} (заблокировали/не запускали бота), "
          f"429-повторов по пути {throttled}.", flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env node
// ZNWR Arcade Sale — розыгрыш плаща инженера.
// Взвешенное колесо: билеты = √(очки рейтинга). Корень сглаживает отрыв
// накрутчиков и честнее держит правило «выиграть может каждый».
//
// Прозрачность (commit-reveal):
//   1) ЗАРАНЕЕ (до дедлайна) опубликуй seed или его хеш — репетиция ниже печатает
//      случайный seed и его SHA-256. Публикуешь хеш → доказываешь, что seed
//      выбран заранее и результат не подкручен.
//   2) В ДЕНЬ ИТОГОВ прогоняешь боевой розыгрыш С ТЕМ ЖЕ seed:
//        node tools/draw-winner.mjs --seed <hex>
//      Победитель детерминирован от (seed + список участников), любой может
//      перепроверить по сохранённому снапшоту.
//
// Запуск:
//   node tools/draw-winner.mjs --dry            — репетиция (генерит и печатает seed)
//   node tools/draw-winner.mjs --seed <hex>     — боевой (детерминированный по seed)
//   node tools/draw-winner.mjs                  — боевой со свежим случайным seed
//   node tools/draw-winner.mjs --include-anon   — допустить анонимов (по умолчанию
//                                                 только tg:-игроки, анониму приз не вручить)
//
// Доступ к полному списку участников идёт через приватный action=draw. Если на
// сервере задан DRAW_SECRET — положи его в переменную окружения DRAW_SECRET.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT = "https://script.google.com/macros/s/AKfycbyyVhu_3TZ0X9NdyFIE0B2EJiCAlF18Eglhc5w2wOOQLJQ8hELMUHsmyDUCNRUYUMr2Dg/exec";

const dryRun = process.argv.includes("--dry");
const includeAnon = process.argv.includes("--include-anon");
const seedFlagIndex = process.argv.indexOf("--seed");
const providedSeed = seedFlagIndex !== -1 ? process.argv[seedFlagIndex + 1] : null;
const drawSecret = process.env.DRAW_SECRET || "";

// Билеты = √(очки). Отрыв кита с ~10000 очков над новичком с ~1000 сжимается
// с 10× до ~3×, а над активным игроком (~3000) — с 3.5× до ~1.8×.
function ticketsFor(rating) {
  return Math.sqrt(Math.max(0, Number(rating) || 0));
}

const query = new URLSearchParams({ action: "draw", limit: "5000", ts: String(Date.now()) });
if (drawSecret) query.set("secret", drawSecret);

const response = await fetch(`${ENDPOINT}?${query.toString()}`);
const data = await response.json();
if (!data?.ok || !Array.isArray(data.players)) {
  console.error("Не удалось получить список участников:", JSON.stringify(data));
  if (data?.error === "forbidden") {
    console.error("→ action=draw защищён DRAW_SECRET. Задай переменную окружения DRAW_SECRET.");
  }
  process.exit(1);
}
if (data.guarded === false) {
  console.warn("⚠️ Приватный endpoint НЕ защищён (DRAW_SECRET на сервере пуст) — список участников доступен всем.");
}

const players = data.players
  .filter((player) => ticketsFor(player.rating) > 0)
  .filter((player) => includeAnon || String(player.key).startsWith("tg:"))
  // Фиксированный порядок → воспроизводимость reveal при одном seed.
  .sort((a, b) => String(a.key).localeCompare(String(b.key)));

if (!players.length) {
  console.error("Нет участников с очками. Розыгрыш невозможен.");
  process.exit(1);
}

const withTickets = players.map((player) => ({ ...player, tickets: ticketsFor(player.rating) }));
const totalTickets = withTickets.reduce((sum, player) => sum + player.tickets, 0);

// Seed: заданный (reveal) или свежий крипто-случайный (commit). Победитель
// детерминирован от seed и канонического списка участников — воспроизводимо.
const seed = providedSeed || crypto.randomBytes(16).toString("hex");
const seedHash = crypto.createHash("sha256").update(seed).digest("hex");
const canonical = JSON.stringify(withTickets.map((p) => [p.key, Number(p.rating) || 0]));
const digest = crypto.createHmac("sha256", seed).update(canonical).digest();
const randomFraction = digest.readUIntBE(0, 6) / 2 ** 48;
const winningTicket = randomFraction * totalTickets;

let cumulative = 0;
let winner = withTickets[withTickets.length - 1];
for (const player of withTickets) {
  cumulative += player.tickets;
  if (winningTicket < cumulative) {
    winner = player;
    break;
  }
}

const stamp = new Date().toISOString();
console.log(`ZNWR ARCADE SALE — РОЗЫГРЫШ ${dryRun ? "(РЕПЕТИЦИЯ)" : ""}`);
console.log(`Время: ${stamp}`);
console.log(`Seed: ${seed}`);
console.log(`Seed SHA-256 (публикуй заранее): ${seedHash}`);
console.log(`Участников: ${withTickets.length} · Всего билетов (√очков): ${totalTickets.toFixed(2)}`);
console.log(`Выигрышный билет: ${winningTicket.toFixed(2)} (fraction=${randomFraction.toFixed(12)})`);
console.log("");
console.log("Шансы участников (по билетам = √очков):");
for (const player of withTickets) {
  const chance = ((player.tickets / totalTickets) * 100).toFixed(2);
  const mark = player === winner ? " ←★ ПОБЕДИТЕЛЬ" : "";
  console.log(
    `  ${String(player.name).padEnd(24)} ${String(player.rating).padStart(6)} PTS  `
    + `${player.tickets.toFixed(1).padStart(6)} бил.  ${chance.padStart(6)}%${mark}`,
  );
}
console.log("");
console.log(`🏆 ПОБЕДИТЕЛЬ: ${winner.name} (${winner.key}) — ${winner.rating} PTS, игр: ${winner.gamesDone}/3`);
if (winner.username) console.log(`   Telegram: @${winner.username}`);
if (!String(winner.key).startsWith("tg:")) {
  console.log("⚠️ Победитель анонимный (играл вне Telegram) — связаться с ним не получится.");
}

// Снапшот на диск: доказательство, что розыгрыш прошёл именно по этим данным и
// этому seed. Любой может перепроверить выбор победителя офлайн.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(__dirname, "draw-results");
fs.mkdirSync(resultsDir, { recursive: true });
const snapshotFile = path.join(resultsDir, `draw-${stamp.replace(/[:.]/g, "-")}${dryRun ? "-dry" : ""}.json`);
fs.writeFileSync(snapshotFile, JSON.stringify({
  stamp,
  dryRun,
  seed,
  seedHash,
  totalTickets,
  winningTicket,
  randomFraction,
  winner: { key: winner.key, name: winner.name, rating: winner.rating, tickets: winner.tickets },
  participants: withTickets.map((p) => ({
    key: p.key,
    name: p.name,
    username: p.username || "",
    rating: p.rating,
    tickets: p.tickets,
    gamesDone: p.gamesDone,
  })),
}, null, 2));
console.log("");
console.log(`📄 Снапшот сохранён: ${path.relative(process.cwd(), snapshotFile)}`);

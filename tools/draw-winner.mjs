#!/usr/bin/env node
// ZNWR Arcade Sale — розыгрыш плаща инженера.
// Взвешенное колесо: очки рейтинга = билеты, чем больше очков — тем выше шанс.
//
// Запуск (когда придёт время итогов):
//   node tools/draw-winner.mjs            — боевой розыгрыш
//   node tools/draw-winner.mjs --dry      — репетиция (помечает результат как тестовый)
//   node tools/draw-winner.mjs --include-anon  — допустить анонимных игроков (по умолчанию
//                                                участвуют только Telegram-игроки, потому что
//                                                анониму невозможно вручить приз)

import crypto from "node:crypto";

const ENDPOINT = "https://script.google.com/macros/s/AKfycbyyVhu_3TZ0X9NdyFIE0B2EJiCAlF18Eglhc5w2wOOQLJQ8hELMUHsmyDUCNRUYUMr2Dg/exec";

const dryRun = process.argv.includes("--dry");
const includeAnon = process.argv.includes("--include-anon");

const response = await fetch(`${ENDPOINT}?action=rating&limit=200&ts=${Date.now()}`);
const data = await response.json();
if (!data?.ok || !Array.isArray(data.players)) {
  console.error("Не удалось получить рейтинг:", JSON.stringify(data));
  process.exit(1);
}

const players = data.players
  .filter((player) => (Number(player.rating) || 0) > 0)
  .filter((player) => includeAnon || String(player.key).startsWith("tg:"));

if (!players.length) {
  console.error("Нет участников с очками. Розыгрыш невозможен.");
  process.exit(1);
}

const totalTickets = players.reduce((sum, player) => sum + player.rating, 0);

// Криптографически случайный билет в диапазоне [0, totalTickets).
const randomFraction = crypto.randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
const winningTicket = randomFraction * totalTickets;

let cumulative = 0;
let winner = players[players.length - 1];
for (const player of players) {
  cumulative += player.rating;
  if (winningTicket < cumulative) {
    winner = player;
    break;
  }
}

const stamp = new Date().toISOString();
console.log(`ZNWR ARCADE SALE — РОЗЫГРЫШ ${dryRun ? "(РЕПЕТИЦИЯ)" : ""}`);
console.log(`Время: ${stamp}`);
console.log(`Участников: ${players.length} · Всего билетов (очков): ${totalTickets}`);
console.log(`Выигрышный билет: ${winningTicket.toFixed(2)} (random=${randomFraction.toFixed(12)})`);
console.log("");
console.log("Шансы участников:");
for (const player of players) {
  const chance = ((player.rating / totalTickets) * 100).toFixed(2);
  const mark = player === winner ? " ←★ ПОБЕДИТЕЛЬ" : "";
  console.log(`  ${player.name.padEnd(24)} ${String(player.rating).padStart(6)} PTS  ${chance.padStart(6)}%${mark}`);
}
console.log("");
console.log(`🏆 ПОБЕДИТЕЛЬ: ${winner.name} (${winner.key}) — ${winner.rating} PTS, игр: ${winner.gamesDone}/3`);
if (!String(winner.key).startsWith("tg:")) {
  console.log("⚠️ Победитель анонимный (играл вне Telegram) — связаться с ним не получится.");
}

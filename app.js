const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor("#0025ff");
  tg.setBackgroundColor("#0025ff");
}

// Telegram WebView height differs from device 100dvh — drive layout off the real
// available height so absolute panels never overflow / overlap. Telegram grows the
// viewport asynchronously after expand(), and old clients (6.0) report the height
// late, so we resync on every signal and a few times right after launch.
function syncViewportHeight() {
  const candidates = [tg?.viewportStableHeight, tg?.viewportHeight, window.innerHeight]
    .map((value) => Number(value) || 0)
    .filter((value) => value > 0);
  if (!candidates.length) return;
  const height = Math.min(...candidates);
  document.documentElement.style.setProperty("--app-h", `${Math.round(height)}px`);
}

syncViewportHeight();
tg?.onEvent?.("viewportChanged", syncViewportHeight);
window.addEventListener("resize", syncViewportHeight);
window.addEventListener("orientationchange", () => window.setTimeout(syncViewportHeight, 120));
window.addEventListener("load", syncViewportHeight);
// Catch the height that only settles after Telegram finishes the expand animation.
[80, 250, 500, 900, 1500].forEach((delay) => window.setTimeout(syncViewportHeight, delay));

const app = document.querySelector(".app");
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreNode = document.querySelector("#score");
const targetNode = document.querySelector("#target");
const gameLabelNode = document.querySelector("#gameLabel");
const startButton = document.querySelector("#startButton");
const znwrButton = document.querySelector("#znwrButton");
const gameButtons = [...document.querySelectorAll(".game-option")];
const menuButton = document.querySelector("#menuButton");
const saleButton = document.querySelector("#saleButton");
const ratingButton = document.querySelector("#ratingButton");
const ratingIntroButton = document.querySelector("#ratingIntroButton");
const ratingPanel = document.querySelector("#ratingPanel");
const ratingList = document.querySelector("#ratingList");
const chanceText = document.querySelector("#chanceText");
const instagramShareButton = document.querySelector("#instagramShareButton");
const ratingCloseButton = document.querySelector("#ratingCloseButton");
const salePanel = document.querySelector("#salePanel");
const saleDetailsBlock = document.querySelector("#saleDetailsBlock");
const saleDetailsButton = document.querySelector("#saleDetailsButton");
const saleChannelButton = document.querySelector("#saleChannelButton");
const saleCloseButton = document.querySelector("#saleCloseButton");
const rulesPanel = document.querySelector("#rulesPanel");
const rulesIntroButton = document.querySelector("#rulesIntroButton");
const rulesButton = document.querySelector("#rulesButton");
const rulesCloseButton = document.querySelector("#rulesCloseButton");
const tgShareButton = document.querySelector("#tgShareButton");
const prizeTgButton = document.querySelector("#prizeTgButton");
const prizeSaleButton = document.querySelector("#prizeSaleButton");
const againButton = document.querySelector("#againButton");
const otherGamesButton = document.querySelector("#otherGamesButton");
const restartButton = document.querySelector("#restartButton");
const gameoverMenuButton = document.querySelector("#gameoverMenuButton");
const prizePanel = document.querySelector("#prizePanel");
const gameoverPanel = document.querySelector("#gameoverPanel");
const resultPlaceNode = document.querySelector("#resultPlace");
const resultSummaryNode = document.querySelector("#resultSummary");
const resultBestGameNode = document.querySelector("#resultBestGame");
const resultChanceNode = document.querySelector("#resultChance");
const prizeShareButton = document.querySelector("#prizeShareButton");
const soundButton = document.querySelector("#soundButton");
const upButton = document.querySelector("#upButton");
const downButton = document.querySelector("#downButton");
const leftButton = document.querySelector("#leftButton");
const rightButton = document.querySelector("#rightButton");

const soundStorageKey = "znwr-garage-sale-sound";
const ratingStorageKey = "znwr-garage-sale-rating";
const sharesStorageKey = "znwr-garage-sale-shares";
const legacyRepostStorageKey = "znwr-garage-sale-repost";
const qualifiedStorageKey = "znwr-garage-sale-qualified";
const shareBonusPoints = 150;
const shareBonusMax = 20;
const analyticsEndpoint = "https://script.google.com/macros/s/AKfycbyyVhu_3TZ0X9NdyFIE0B2EJiCAlF18Eglhc5w2wOOQLJQ8hELMUHsmyDUCNRUYUMr2Dg/exec";
const urlParams = new URLSearchParams(window.location.search);
const trafficSource = urlParams.get("src") || urlParams.get("utm_source") || "";
const botShareUrl = urlParams.get("botLink") || "https://t.me/znwr_bot";
const salePostUrl = urlParams.get("postLink") || "https://t.me/znwr";
const znwrSiteUrl = "https://znwr.ru/?utm_source=tg_game";
const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const gameModes = {
  pac: { label: "PAC SALE", target: 24, coefficient: 1, parSeconds: 55 },
  invaders: { label: "CODE INVADERS", target: 10, coefficient: 1.12, parSeconds: 45 },
  breakout: { label: "PROMO BREAKOUT", target: 18, coefficient: 1.06, parSeconds: 50 },
};

const demoLeaders = [
  { name: "@pixel_minsk", rating: 3285, gamesDone: 3, bestGame: "PAC SALE", totalSeconds: 132 },
  { name: "@nemiga1986", rating: 3018, gamesDone: 3, bestGame: "CODE INVADERS", totalSeconds: 148 },
  { name: "@breadboss", rating: 2760, gamesDone: 2, bestGame: "PROMO BREAKOUT", totalSeconds: 94 },
  { name: "@znwr_runner", rating: 2310, gamesDone: 2, bestGame: "PAC SALE", totalSeconds: 104 },
  { name: "@archive_kid", rating: 1745, gamesDone: 1, bestGame: "CODE INVADERS", totalSeconds: 57 },
];

let serverLeaders = null;
let serverLeadersLoadedAt = 0;
let serverLeadersPromise = null;

const maze = [
  "#############",
  "#P....#....G#",
  "#.##.#.#.##.#",
  "#...........#",
  "###.#.#.#.###",
  "#...#...#...#",
  "#.#.##.##.#.#",
  "#.#.......#.#",
  "#.#.#####.#.#",
  "#...........#",
  "#.##.#.#.##.#",
  "#G....#....G#",
  "#############",
];

const startPlayer = { x: 1, y: 1 };
const enemyStarts = [
  { x: 11, y: 1, dirX: -1, dirY: 0 },
  { x: 1, y: 11, dirX: 1, dirY: 0 },
  { x: 11, y: 11, dirX: -1, dirY: 0 },
];

// Уровень pac = очистить всю карту; очков за уровень = число точек (для рейтинга).
gameModes.pac.target = maze.reduce(
  (sum, row) => sum + [...row].filter((cell) => cell === ".").length,
  0,
);

const state = {
  mode: "intro",
  gameType: "pac",
  score: 0,
  target: 24,
  level: 1,
  flash: null,
  enemySpeed: 3.1,
  width: 360,
  height: 640,
  tile: 22,
  offsetX: 0,
  offsetY: 0,
  dots: new Set(),
  player: {
    x: 1,
    y: 1,
    px: 1,
    py: 1,
    targetX: 1,
    targetY: 1,
    dirX: 0,
    dirY: 0,
    wantX: 0,
    wantY: 0,
  },
  enemies: [],
  invaders: null,
  breakout: null,
  particles: [],
  lastFrame: 0,
  gameStartedAt: 0,
  dangerUntil: 0,
  infoOpen: false,
  soundEnabled: localStorage.getItem(soundStorageKey) !== "off",
};

const music = {
  context: null,
  gain: null,
  timer: null,
  step: 0,
  tempo: 118,
  notes: [
    523.25, 659.25, 783.99, 659.25,
    587.33, 739.99, 880.0, 739.99,
    493.88, 659.25, 783.99, 659.25,
    440.0, 587.33, 698.46, 587.33,
  ],
  bass: [130.81, 130.81, 164.81, 164.81, 146.83, 146.83, 110.0, 110.0],
};

function keyOf(x, y) {
  return `${x}:${y}`;
}

function isWall(x, y) {
  return maze[y]?.[x] == null || maze[y][x] === "#";
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  state.width = rect.width;
  state.height = rect.height;
  const availableWidth = rect.width * 0.82;
  const availableHeight = rect.height * 0.52;
  state.tile = Math.floor(Math.min(availableWidth / maze[0].length, availableHeight / maze.length));
  state.tile = Math.max(18, Math.min(28, state.tile));
  state.offsetX = Math.round((rect.width - state.tile * maze[0].length) / 2);
  state.offsetY = Math.round(rect.height * 0.23);
}

function setMode(mode) {
  state.mode = mode;
  app.dataset.state = mode;
}

function selectGame(gameType) {
  if (!gameModes[gameType]) return;
  state.gameType = gameType;
  updateGameChrome();
  gameButtons.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.game === gameType);
  });
}

function updateGameChrome() {
  const mode = gameModes[state.gameType];
  state.target = mode.target;
  updateHud();
}

function updateHud() {
  scoreNode.textContent = String(state.score).padStart(2, "0");
  targetNode.textContent = String(state.level);
  gameLabelNode.textContent = gameModes[state.gameType].label;
}

function resetGame() {
  state.score = 0;
  state.level = 1;
  state.flash = null;
  state.gameStartedAt = Date.now();
  state.particles = [];
  state.dangerUntil = 0;
  updateGameChrome();
  respawnLevelObjects();
}

function respawnLevelObjects() {
  if (state.gameType === "pac") resetPacGame();
  if (state.gameType === "invaders") resetInvadersGame();
  if (state.gameType === "breakout") resetBreakoutGame();
}

// Общий для всех игр переход на следующий уровень: очки сохраняются, объекты
// возрождаются сложнее (reset-функции читают state.level), показываем баннер.
function levelUp() {
  state.level += 1;
  respawnLevelObjects();
  updateHud();
  if (state.level === 2 && !isQualified()) {
    markQualified();
    showFlash("ТЫ В РОЗЫГРЫШЕ!");
    logEvent("raffle_qualified", { game_type: state.gameType });
  } else if (state.level === 2) {
    showFlash("БАЗА ПРОЙДЕНА");
  } else {
    showFlash(`УРОВЕНЬ ${state.level}`);
  }
  logEvent("level_up", { level: state.level, score: state.score });
  softenMusic();
  playWinJingle();
  tg?.HapticFeedback?.notificationOccurred("success");
}

function showFlash(text) {
  state.flash = { text, until: state.lastFrame + 1200 };
}

function isQualified() {
  return localStorage.getItem(qualifiedStorageKey) === "on";
}

function markQualified() {
  localStorage.setItem(qualifiedStorageKey, "on");
}

function resetPacGame() {
  state.dots = new Set();
  maze.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === ".") state.dots.add(keyOf(x, y));
    });
  });
  state.player = {
    x: startPlayer.x,
    y: startPlayer.y,
    px: startPlayer.x,
    py: startPlayer.y,
    targetX: startPlayer.x,
    targetY: startPlayer.y,
    dirX: 0,
    dirY: 0,
    wantX: 0,
    wantY: 0,
  };
  state.enemies = enemyStarts.map((enemy) => ({
    startX: enemy.x,
    startY: enemy.y,
    x: enemy.x,
    y: enemy.y,
    px: enemy.x,
    py: enemy.y,
    targetX: enemy.x,
    targetY: enemy.y,
    dirX: enemy.dirX,
    dirY: enemy.dirY,
  }));
  // Призраки быстрее с каждым уровнем.
  state.enemySpeed = 3.1 + (state.level - 1) * 0.55;
  state.invaders = null;
  state.breakout = null;
}

function resetInvadersGame() {
  const cols = 5;
  const rows = 2;
  const aliens = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      aliens.push({ x, y, alive: true });
    }
  }
  state.invaders = {
    playerX: 0.5,
    playerDir: 0,
    shot: null,
    aliens,
    cols,
    rows,
    alienDir: 1,
    alienOffsetX: 0,
    alienOffsetY: 0,
    // Стартовая скорость и шаг спуска растут с уровнем.
    alienSpeed: 0.084 + (state.level - 1) * 0.02,
    dropStep: 0.032 + (state.level - 1) * 0.006,
    fireCooldown: 0,
  };
  state.dots = new Set();
  state.enemies = [];
  state.breakout = null;
}

function resetBreakoutGame() {
  const bricks = [];
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      bricks.push({ x, y, alive: true });
    }
  }
  // Мяч быстрее с каждым уровнем.
  const speed = 1 + (state.level - 1) * 0.13;
  state.breakout = {
    paddleX: 0.5,
    paddleDir: 0,
    launched: false,
    ball: { x: 0.5, y: 0.76, vx: 0.28 * speed, vy: -0.42 * speed },
    bricks,
  };
  state.dots = new Set();
  state.enemies = [];
  state.invaders = null;
}

function startGame(gameType = state.gameType) {
  selectGame(gameType);
  state.infoOpen = false;
  salePanel.hidden = true;
  ratingPanel.hidden = true;
  prizePanel.hidden = true;
  gameoverPanel.hidden = true;
  resetGame();
  setMode("playing");
  resize();
  startMusic();
  logEvent("game_start");
  tg?.HapticFeedback?.impactOccurred("medium");
}

function returnToMenu() {
  state.infoOpen = false;
  salePanel.hidden = true;
  ratingPanel.hidden = true;
  prizePanel.hidden = true;
  gameoverPanel.hidden = true;
  rulesPanel.hidden = true;
  setMode("intro");
  resetGame();
  startMusic();
  logEvent("menu_opened");
  tg?.HapticFeedback?.impactOccurred("light");
}

function openSaleInfo() {
  state.infoOpen = true;
  ratingPanel.hidden = true;
  salePanel.hidden = false;
  logEvent("sale_info_open");
  tg?.HapticFeedback?.impactOccurred("light");
}

function closeSaleInfo() {
  state.infoOpen = false;
  salePanel.hidden = true;
  if (state.mode === "prize") prizePanel.hidden = false;
  tg?.HapticFeedback?.impactOccurred("light");
}

function openSaleDetails() {
  const willShow = saleDetailsBlock.hidden;
  saleDetailsBlock.hidden = !willShow;
  saleDetailsButton.textContent = willShow ? "СКРЫТЬ" : "ПОДРОБНЕЕ";
  if (willShow) logEvent("sale_details_open");
  tg?.HapticFeedback?.impactOccurred("light");
}

function openSaleChannel() {
  logEvent("sale_channel_open", { sale_post_url: salePostUrl });
  if (tg?.openTelegramLink && /^https:\/\/t\.me\//.test(salePostUrl)) {
    tg.openTelegramLink(salePostUrl);
  } else {
    window.open(salePostUrl, "_blank", "noopener");
  }
  tg?.HapticFeedback?.impactOccurred("light");
}

function openRules() {
  state.infoOpen = state.mode === "playing";
  rulesPanel.hidden = false;
  logEvent("rules_open");
  tg?.HapticFeedback?.impactOccurred("light");
}

function closeRules() {
  state.infoOpen = false;
  rulesPanel.hidden = true;
  tg?.HapticFeedback?.impactOccurred("light");
}

function shareToTelegram() {
  const place = localRatingPlace();
  const intro = place ? `Я #${place} в рейтинге ZNWR Arcade Sale! ` : "";
  const text = `${intro}ZNWR GARAGE + SAMPLE SALE — 10-12 июля, Хлебозавод (Немига). Скидки 20-90% и розыгрыш плаща инженера. Сыграй в аркаду и попади в рейтинг!`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(botShareUrl)}&text=${encodeURIComponent(text)}`;
  registerShare("telegram");
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, "_blank", "noopener");
  }
  updateShareUi();
  updateResultPanel();
  if (!ratingPanel.hidden) renderRating();
  tg?.HapticFeedback?.impactOccurred("light");
}

function openZnwrSite() {
  logEvent("znwr_site_open", { url: znwrSiteUrl });
  if (tg?.openLink) {
    tg.openLink(znwrSiteUrl);
  } else {
    window.open(znwrSiteUrl, "_blank", "noopener");
  }
  tg?.HapticFeedback?.impactOccurred("light");
}

function localPlayerName() {
  const tgUser = tg?.initDataUnsafe?.user || {};
  if (tgUser.username) return `@${tgUser.username}`;
  if (tgUser.first_name) return tgUser.first_name;
  return "YOU";
}

function localPlayerKey() {
  const tgUser = tg?.initDataUnsafe?.user || {};
  return tgUser.id ? `tg:${tgUser.id}` : `anon:${sessionId}`;
}

function getStoredRating() {
  try {
    const stored = JSON.parse(localStorage.getItem(ratingStorageKey) || "null");
    if (!stored) return { games: {} };
    if (stored.games) return stored;
    const gameType = Object.keys(gameModes).find((key) => gameModes[key].label === stored.game) || "pac";
    return { games: { [gameType]: { ...stored, gameType } } };
  } catch {
    return { games: {} };
  }
}

function getLocalBest() {
  return aggregateLocalRating();
}

function shareCount() {
  const stored = Number(localStorage.getItem(sharesStorageKey));
  if (Number.isFinite(stored) && stored > 0) return Math.min(stored, shareBonusMax);
  return localStorage.getItem(legacyRepostStorageKey) === "on" ? 1 : 0;
}

function sharePoints() {
  return shareCount() * shareBonusPoints;
}

function shareBonusText() {
  return shareCount() > 0
    ? `РЕПОСТЫ: ${shareCount()} · БОНУС +${sharePoints()} ОЧКОВ`
    : `КАЖДЫЙ РЕПОСТ = +${shareBonusPoints} ОЧКОВ`;
}

function registerShare(source) {
  const next = Math.min(shareCount() + 1, shareBonusMax);
  localStorage.setItem(sharesStorageKey, String(next));
  logEvent("share_bonus", {
    share_source: source,
    share_count: next,
    share_points: next * shareBonusPoints,
  });
}

function updateShareUi() {
  chanceText.textContent = shareBonusText();
  instagramShareButton.textContent = "УВЕЛИЧИТЬ ШАНСЫ (INSTA)";
  instagramShareButton.disabled = false;
  prizeShareButton.textContent = "УВЕЛИЧИТЬ ШАНСЫ (INSTA)";
  prizeShareButton.disabled = false;
}

function saveLocalBest(result) {
  const rating = getStoredRating();
  const previous = rating.games[result.gameType];
  const isBetter = !previous
    || result.score > previous.score
    || (result.score === previous.score && result.seconds < previous.seconds);
  if (!isBetter) return;
  rating.games[result.gameType] = result;
  localStorage.setItem(ratingStorageKey, JSON.stringify(rating));
}

function recordRatingResult(outcome) {
  if (!state.gameStartedAt) return;
  const result = {
    name: localPlayerName(),
    gameType: state.gameType,
    game: gameModes[state.gameType].label,
    score: state.score,
    seconds: getPlaySeconds(),
    outcome,
  };
  saveLocalBest(result);
  const aggregate = aggregateLocalRating();
  logEvent("rating_result", {
    outcome,
    result_score: result.score,
    result_seconds: result.seconds,
    game_rating: calculateGameRating(result),
    total_rating: aggregate?.rating || 0,
    games_done: aggregate?.gamesDone || 0,
    share_count: shareCount(),
  });
}

function fetchLeaderboard(force = false) {
  if (!analyticsEndpoint) return Promise.resolve(null);
  if (serverLeadersPromise) return serverLeadersPromise;
  if (!force && serverLeaders && Date.now() - serverLeadersLoadedAt < 30000) {
    return Promise.resolve(serverLeaders);
  }
  serverLeadersPromise = fetch(`${analyticsEndpoint}?action=rating&limit=10&ts=${Date.now()}`)
    .then((response) => response.json())
    .then((data) => {
      if (data?.ok && Array.isArray(data.players)) {
        serverLeaders = data.players.map((player) => ({
          key: String(player.key || ""),
          name: String(player.name || "PLAYER"),
          rating: Number(player.rating) || 0,
          gamesDone: Number(player.gamesDone) || 0,
          bestGame: String(player.bestGame || gameModes.pac.label),
          totalSeconds: Number(player.totalSeconds) || 0,
        }));
        serverLeadersLoadedAt = Date.now();
      }
      return serverLeaders;
    })
    .catch(() => serverLeaders)
    .finally(() => {
      serverLeadersPromise = null;
    });
  return serverLeadersPromise;
}

function combinedRatingRows() {
  const localKey = localPlayerKey();
  const localRating = aggregateLocalRating();
  const boostedRating = localRating
    ? { ...localRating, key: localKey, isLocal: true }
    : null;
  const base = serverLeaders
    ? serverLeaders.filter((row) => row.key !== localKey)
    : demoLeaders;
  const serverSelf = serverLeaders?.find((row) => row.key === localKey) || null;
  const rows = base.slice();
  if (boostedRating && serverSelf && serverSelf.rating > boostedRating.rating) {
    rows.push({ ...serverSelf, isLocal: true });
  } else if (boostedRating) {
    rows.push(boostedRating);
  } else if (serverSelf) {
    rows.push({ ...serverSelf, isLocal: true });
  }
  return sortRatingRows(rows);
}

function leaderboardRows() {
  return combinedRatingRows().slice(0, 6);
}

function sortRatingRows(rows) {
  return rows
    .slice()
    .sort((a, b) => b.rating - a.rating || b.gamesDone - a.gamesDone || a.totalSeconds - b.totalSeconds);
}

function localRatingPlace() {
  const index = combinedRatingRows().findIndex((row) => row.isLocal);
  return index === -1 ? null : index + 1;
}

// Очки за игру с затухающей отдачей за уровни: 1-й уровень = 1000×коэф (база),
// каждый следующий добавляет 1/N от базы. Предела нет, но дальние уровни дают
// мало, поэтому огромный отрыв невозможен, а «выиграть может каждый» держится.
function calculateGameRating(result) {
  const mode = gameModes[result.gameType] || gameModes.pac;
  const perLevel = mode.target;
  const fullLevels = Math.floor(result.score / perLevel);
  const partial = (result.score - fullLevels * perLevel) / perLevel;
  let weight = 0;
  for (let k = 1; k <= fullLevels; k += 1) weight += 1 / k;
  weight += partial / (fullLevels + 1);
  return Math.round(weight * 1000 * mode.coefficient);
}

function aggregateLocalRating() {
  const rating = getStoredRating();
  const results = Object.values(rating.games || {});
  if (!results.length) return null;
  const totalRating = results.reduce((sum, result) => sum + calculateGameRating(result), 0) + sharePoints();
  const totalSeconds = results.reduce((sum, result) => sum + result.seconds, 0);
  const best = results
    .slice()
    .sort((a, b) => calculateGameRating(b) - calculateGameRating(a))[0];
  return {
    name: localPlayerName(),
    rating: totalRating,
    gamesDone: results.length,
    bestGame: best.game,
    totalSeconds,
    results,
  };
}

function updateResultPanel() {
  const aggregate = aggregateLocalRating();
  const place = localRatingPlace();
  if (!aggregate) {
    resultPlaceNode.textContent = "РЕЙТИНГ";
    resultSummaryNode.textContent = "СЫГРАЙ, ЧТОБЫ ПОПАСТЬ В РЕЙТИНГ";
    resultBestGameNode.textContent = "";
  } else {
    resultPlaceNode.textContent = place ? `#${place}` : "РЕЙТИНГ";
    resultSummaryNode.textContent = `${aggregate.rating} ОЧКОВ · ${aggregate.gamesDone}/3 ИГР`;
    resultBestGameNode.textContent = `ЛУЧШАЯ: ${aggregate.bestGame}`;
  }
  resultChanceNode.textContent = shareBonusText();
  prizeShareButton.textContent = "УВЕЛИЧИТЬ ШАНСЫ (INSTA)";
  prizeShareButton.disabled = false;
}

function renderRating() {
  ratingList.innerHTML = "";
  updateShareUi();
  const rows = leaderboardRows();
  if (!rows.length) {
    const item = document.createElement("li");
    item.className = "rating-empty";
    item.textContent = "ПОКА ПУСТО — СЫГРАЙ ПЕРВЫМ";
    ratingList.appendChild(item);
    return;
  }
  rows.forEach((row, index) => {
    const item = document.createElement("li");
    const place = document.createElement("span");
    const player = document.createElement("span");
    const game = document.createElement("span");
    const score = document.createElement("span");
    place.textContent = `#${index + 1}`;
    player.className = "player";
    player.textContent = row.name;
    game.className = "meta";
    game.textContent = `${row.gamesDone}/3 · ${row.bestGame}`;
    score.textContent = `${row.rating} ОЧКОВ`;
    player.appendChild(game);
    item.append(place, player, score);
    ratingList.appendChild(item);
  });
}

function openRating() {
  state.infoOpen = state.mode === "playing";
  salePanel.hidden = true;
  renderRating();
  fetchLeaderboard(true).then(() => {
    if (!ratingPanel.hidden) renderRating();
  });
  ratingPanel.hidden = false;
  logEvent("rating_open");
  tg?.HapticFeedback?.impactOccurred("light");
}

function closeRating() {
  state.infoOpen = false;
  ratingPanel.hidden = true;
  tg?.HapticFeedback?.impactOccurred("light");
}

function drawCenteredText(targetCtx, text, y, size, color = "#ffffff") {
  targetCtx.fillStyle = color;
  targetCtx.font = `900 ${size}px Courier New, monospace`;
  targetCtx.textAlign = "center";
  targetCtx.textBaseline = "middle";
  targetCtx.fillText(text, 540, y);
}

function shareImageBlob() {
  const rating = aggregateLocalRating();
  const currentRating = rating?.rating || 0;
  const ratingPlace = localRatingPlace();
  const ratingText = ratingPlace ? `МОЙ РЕЙТИНГ #${ratingPlace}` : "Я В ИГРЕ";
  const story = document.createElement("canvas");
  story.width = 1080;
  story.height = 1920;
  const storyCtx = story.getContext("2d");
  storyCtx.fillStyle = "#0025ff";
  storyCtx.fillRect(0, 0, story.width, story.height);

  storyCtx.strokeStyle = "#ffffff";
  storyCtx.lineWidth = 8;
  storyCtx.strokeRect(70, 70, 940, 1780);

  // Заголовок в белой плашке
  storyCtx.fillStyle = "#ffffff";
  storyCtx.fillRect(160, 190, 760, 128);
  drawCenteredText(storyCtx, "ZNWR ARCADE SALE", 256, 52, "#0025ff");

  // Сейл
  drawCenteredText(storyCtx, "GARAGE + SAMPLE SALE", 470, 46);
  drawCenteredText(storyCtx, "10-12 ИЮЛЯ · ХЛЕБОЗАВОД, НЕМИГА", 548, 34);
  drawCenteredText(storyCtx, "20-90%", 740, 190);

  // Карточка рейтинга
  storyCtx.fillStyle = "#ffffff";
  storyCtx.fillRect(190, 910, 700, 230);
  drawCenteredText(storyCtx, ratingText, 995, 56, "#0025ff");
  drawCenteredText(storyCtx, `${currentRating} ОЧКОВ`, 1085, 62, "#0025ff");

  // Приз
  drawCenteredText(storyCtx, "РОЗЫГРЫШ ПЛАЩА ИНЖЕНЕРА", 1340, 46);

  // Подпись магазина (призыв отметить — в самом приложении, не на сторис)
  storyCtx.fillStyle = "#ffffff";
  storyCtx.fillRect(285, 1500, 510, 115);
  drawCenteredText(storyCtx, "@ZNWR.STORE", 1560, 54, "#0025ff");

  drawCenteredText(storyCtx, "PLAY / SHARE / WIN", 1750, 32);

  return new Promise((resolve, reject) => {
    story.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Story image could not be created"));
    }, "image/png");
  });
}

async function shareToInstagram() {
  instagramShareButton.disabled = true;
  prizeShareButton.disabled = true;
  instagramShareButton.textContent = "ГОТОВИМ PNG";
  prizeShareButton.textContent = "ГОТОВИМ PNG";
  try {
    const blob = await shareImageBlob();
    const file = new File([blob], "znwr-arcade-sale.png", { type: "image/png" });
    const shareData = {
      title: "ZNWR Arcade Sale",
      text: "Отметь @znwr.store в сторис — розыгрыш плаща инженера на ZNWR Arcade Sale!",
      files: [file],
    };

    if (navigator.canShare?.(shareData)) {
      instagramShareButton.textContent = "ШЕРИМ...";
      prizeShareButton.textContent = "ШЕРИМ...";
      await navigator.share(shareData);
    } else {
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = "znwr-arcade-sale.png";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
    }

    registerShare("instagram");
    updateShareUi();
    updateResultPanel();
    renderRating();
    tg?.HapticFeedback?.notificationOccurred("success");
  } catch (error) {
    updateShareUi();
    updateResultPanel();
    logEvent("instagram_share_cancelled");
  }
}

// Игры бесконечные — забег всегда кончается проигрышем; показываем экран
// результата (рейтинг, шеринг, инфо о сейле).
function gameOver() {
  recordRatingResult("game_over");
  updateResultPanel();
  fetchLeaderboard(true).then(() => {
    if (!prizePanel.hidden) updateResultPanel();
  });
  prizePanel.hidden = false;
  gameoverPanel.hidden = true;
  setMode("prize");
  stopMusic();
  playGameOverJingle();
  const aggregate = aggregateLocalRating();
  logEvent("game_over", {
    total_rating: aggregate?.rating || 0,
    games_done: aggregate?.gamesDone || 0,
    rating_place: localRatingPlace() || "",
    share_count: shareCount(),
    level: state.level,
    result_score: state.score,
  });
  tg?.HapticFeedback?.notificationOccurred("error");
}

function getPlaySeconds() {
  if (!state.gameStartedAt) return 0;
  return Math.round((Date.now() - state.gameStartedAt) / 1000);
}

function logEvent(eventName, extra = {}) {
  if (!analyticsEndpoint) return;
  const tgUser = tg?.initDataUnsafe?.user || {};
  const payload = {
    event: eventName,
    session_id: sessionId,
    src: trafficSource,
    timestamp: new Date().toISOString(),
    score: state.score,
    target: state.target,
    play_seconds: getPlaySeconds(),
    mode: state.mode,
    game_type: state.gameType,
    sound_enabled: state.soundEnabled,
    app_url: window.location.href,
    user_agent: navigator.userAgent,
    telegram_init_data: tg?.initData || "",
    telegram_user_id: tgUser.id || "",
    telegram_username: tgUser.username || "",
    telegram_first_name: tgUser.first_name || "",
    telegram_last_name: tgUser.last_name || "",
    ...extra,
  };

  fetch(analyticsEndpoint, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

function createMusicContext() {
  if (music.context) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  music.context = new AudioContext();
  music.gain = music.context.createGain();
  music.gain.gain.value = 0.11;
  music.gain.connect(music.context.destination);
}

function playTone(frequency, duration, volume = 1) {
  if (!music.context || !music.gain || !state.soundEnabled) return;
  const now = music.context.currentTime;
  const oscillator = music.context.createOscillator();
  const envelope = music.context.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(0.22 * volume, now + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(envelope);
  envelope.connect(music.gain);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function scheduleTone(frequency, startOffset, duration, volume = 1) {
  if (!music.context || !music.gain || !state.soundEnabled) return;
  const now = music.context.currentTime + startOffset;
  const oscillator = music.context.createOscillator();
  const envelope = music.context.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(0.26 * volume, now + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(envelope);
  envelope.connect(music.gain);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function playWinJingle() {
  if (!state.soundEnabled) return;
  createMusicContext();
  music.context?.resume();
  scheduleTone(523.25, 0.00, 0.12, 0.9);
  scheduleTone(659.25, 0.12, 0.12, 0.9);
  scheduleTone(783.99, 0.24, 0.12, 0.9);
  scheduleTone(1046.5, 0.38, 0.28, 0.95);
  scheduleTone(1567.98, 0.52, 0.18, 0.55);
}

function playGameOverJingle() {
  if (!state.soundEnabled) return;
  createMusicContext();
  music.context?.resume();
  if (music.gain) music.gain.gain.value = 0.14;
  scheduleTone(392.0, 0.00, 0.16, 0.9);
  scheduleTone(349.23, 0.17, 0.16, 0.9);
  scheduleTone(293.66, 0.34, 0.18, 0.9);
  scheduleTone(196.0, 0.54, 0.36, 0.95);
}

function musicTick() {
  const beat = 60 / music.tempo;
  const note = music.notes[music.step % music.notes.length];
  const bass = music.bass[Math.floor(music.step / 2) % music.bass.length];
  playTone(note, beat * 0.38, 0.8);
  if (music.step % 2 === 0) playTone(bass, beat * 0.7, 0.55);
  music.step += 1;
}

function startMusic() {
  if (!state.soundEnabled) return;
  createMusicContext();
  music.context?.resume();
  if (music.gain) music.gain.gain.value = 0.11;
  if (music.timer) return;
  musicTick();
  music.timer = window.setInterval(musicTick, (60 / music.tempo) * 500);
}

// iOS не пускает звук без жеста — разблокируем аудио и заводим фоновую музыку
// на главном экране при первом касании.
function unlockAudio() {
  if (!state.soundEnabled) return;
  createMusicContext();
  music.context?.resume();
  if (state.mode === "intro") startMusic();
}

function stopMusic() {
  if (music.timer) window.clearInterval(music.timer);
  music.timer = null;
}

function softenMusic() {
  if (music.gain) music.gain.gain.value = 0.055;
}

function updateSoundButton() {
  soundButton.textContent = state.soundEnabled ? "SOUND ON" : "SOUND OFF";
  soundButton.setAttribute("aria-label", state.soundEnabled ? "Выключить звук" : "Включить звук");
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem(soundStorageKey, state.soundEnabled ? "on" : "off");
  updateSoundButton();
  if (state.soundEnabled) startMusic();
  if (!state.soundEnabled) stopMusic();
  logEvent(state.soundEnabled ? "sound_on" : "sound_off");
}

function addParticles(x, y) {
  const center = tileCenter(x, y);
  for (let i = 0; i < 10; i += 1) {
    state.particles.push({
      x: center.x,
      y: center.y,
      vx: (Math.random() - 0.5) * 130,
      vy: (Math.random() - 0.5) * 130,
      life: 0.42,
    });
  }
}

function tileCenter(x, y) {
  return {
    x: state.offsetX + x * state.tile + state.tile / 2,
    y: state.offsetY + y * state.tile + state.tile / 2,
  };
}

function setDirection(x, y) {
  if (state.mode !== "playing") return;
  if (state.gameType === "pac") {
    state.player.wantX = x;
    state.player.wantY = y;
    return;
  }
  if (state.gameType === "invaders" && state.invaders) {
    state.invaders.playerDir = x;
    if (y < 0) fireInvaderShot();
    return;
  }
  if (state.gameType === "breakout" && state.breakout) {
    state.breakout.paddleDir = x;
    if (y < 0) launchBreakoutBall();
  }
}

function canMoveFrom(x, y, dirX, dirY) {
  return !isWall(x + dirX, y + dirY);
}

function isMoving(actor) {
  return actor.x !== actor.targetX || actor.y !== actor.targetY;
}

function actorAtOpenTile(actor) {
  return !isWall(actor.x, actor.y) && !isWall(actor.targetX, actor.targetY);
}

function finishStep(actor) {
  actor.x = actor.targetX;
  actor.y = actor.targetY;
  actor.px = actor.x;
  actor.py = actor.y;
}

function beginStep(actor, dirX, dirY) {
  if (!dirX && !dirY) return false;
  if (!canMoveFrom(actor.x, actor.y, dirX, dirY)) return false;
  actor.dirX = dirX;
  actor.dirY = dirY;
  actor.targetX = actor.x + dirX;
  actor.targetY = actor.y + dirY;
  return true;
}

function advanceActor(actor, speed, delta) {
  if (!isMoving(actor)) return;

  const dx = actor.targetX - actor.px;
  const dy = actor.targetY - actor.py;
  const distance = Math.hypot(dx, dy);
  const step = speed * delta;

  if (distance <= step) {
    finishStep(actor);
    return;
  }

  actor.px += (dx / distance) * step;
  actor.py += (dy / distance) * step;
}

function movePlayer(delta) {
  const player = state.player;
  if (!actorAtOpenTile(player)) {
    resetPlayerPosition();
    return;
  }

  if (!isMoving(player)) {
    const turned = beginStep(player, player.wantX, player.wantY);
    if (!turned) beginStep(player, player.dirX, player.dirY);
  }

  advanceActor(player, 5.8, delta);
}

function enemyDirections(enemy) {
  return [
    { x: enemy.dirX, y: enemy.dirY },
    { x: enemy.dirY, y: -enemy.dirX },
    { x: -enemy.dirY, y: enemy.dirX },
    { x: -enemy.dirX, y: -enemy.dirY },
  ].filter((dir) => !isWall(enemy.x + dir.x, enemy.y + dir.y));
}

function updateEnemies(delta) {
  state.enemies.forEach((enemy) => {
    if (!actorAtOpenTile(enemy)) {
      enemy.x = enemy.startX;
      enemy.y = enemy.startY;
      enemy.px = enemy.x;
      enemy.py = enemy.y;
      enemy.targetX = enemy.x;
      enemy.targetY = enemy.y;
    }

    if (!isMoving(enemy)) {
      const dirs = enemyDirections(enemy);
      const forward = dirs.find((dir) => dir.x === enemy.dirX && dir.y === enemy.dirY);
      const choice = Math.random() < 0.72 && forward ? forward : dirs[Math.floor(Math.random() * dirs.length)];
      if (choice) beginStep(enemy, choice.x, choice.y);
    }
    advanceActor(enemy, state.enemySpeed, delta);
  });
}

function collectCurrentTile() {
  const key = keyOf(state.player.x, state.player.y);
  if (state.dots.delete(key)) {
    state.score += 1;
    scoreNode.textContent = String(state.score).padStart(2, "0");
    addParticles(state.player.x, state.player.y);
    tg?.HapticFeedback?.impactOccurred("light");
    if (state.dots.size === 0) levelUp();
  }
}

function handleEnemyHit(time) {
  const hit = state.enemies.some((enemy) => {
    return Math.hypot(enemy.px - state.player.px, enemy.py - state.player.py) < 0.62;
  });
  if (!hit || time < state.dangerUntil) return;

  state.dangerUntil = time + 900;
  gameOver();
}

function resetPlayerPosition() {
  state.player.x = startPlayer.x;
  state.player.y = startPlayer.y;
  state.player.px = startPlayer.x;
  state.player.py = startPlayer.y;
  state.player.targetX = startPlayer.x;
  state.player.targetY = startPlayer.y;
  state.player.dirX = 0;
  state.player.dirY = 0;
  state.player.wantX = 0;
  state.player.wantY = 0;
}

function updatePacGame(delta, time) {
  movePlayer(delta);
  collectCurrentTile();
  updateEnemies(delta);
  handleEnemyHit(time);
}

function gameArea() {
  const width = Math.min(state.width * 0.86, 380);
  const height = Math.min(state.height * 0.58, 460);
  return {
    x: Math.round((state.width - width) / 2),
    y: Math.round(state.height * 0.2),
    w: Math.round(width),
    h: Math.round(height),
  };
}

function normalizedToCanvas(nx, ny) {
  const area = gameArea();
  return {
    x: area.x + nx * area.w,
    y: area.y + ny * area.h,
  };
}

function addParticlesNormalized(nx, ny) {
  const center = normalizedToCanvas(nx, ny);
  for (let i = 0; i < 10; i += 1) {
    state.particles.push({
      x: center.x,
      y: center.y,
      vx: (Math.random() - 0.5) * 150,
      vy: (Math.random() - 0.5) * 150,
      life: 0.42,
    });
  }
}

function positionedAliens() {
  const invaders = state.invaders;
  if (!invaders) return [];
  const spacing = 0.12;
  const startX = 0.5 - ((invaders.cols - 1) * spacing) / 2;
  return invaders.aliens.map((alien) => ({
    ...alien,
    ref: alien,
    cx: startX + alien.x * spacing + invaders.alienOffsetX,
    cy: 0.18 + alien.y * 0.12 + invaders.alienOffsetY,
  }));
}

function positionedBricks() {
  const breakout = state.breakout;
  if (!breakout) return [];
  return breakout.bricks.map((brick) => ({
    ...brick,
    ref: brick,
    cx: 0.17 + brick.x * 0.132,
    cy: 0.16 + brick.y * 0.07,
  }));
}

function fireInvaderShot() {
  const invaders = state.invaders;
  if (!invaders || invaders.shot) return;
  invaders.shot = { x: invaders.playerX, y: 0.82 };
  playTone(987.77, 0.08, 0.55);
}

function updateInvadersGame(delta) {
  const invaders = state.invaders;
  if (!invaders) return;
  invaders.playerX = Math.max(0.08, Math.min(0.92, invaders.playerX + invaders.playerDir * delta * 0.92));
  invaders.alienOffsetX += invaders.alienDir * invaders.alienSpeed * delta;

  if (invaders.alienOffsetX > 0.1 || invaders.alienOffsetX < -0.1) {
    invaders.alienDir *= -1;
    invaders.alienOffsetY += invaders.dropStep;
    invaders.alienSpeed = Math.min(0.15 + (state.level - 1) * 0.02, invaders.alienSpeed + 0.0075);
  }

  if (invaders.shot) {
    invaders.shot.y -= delta * 1.18;
    if (invaders.shot.y < 0.02) invaders.shot = null;
  }

  const liveAliens = positionedAliens().filter((alien) => alien.alive);
  if (liveAliens.some((alien) => alien.cy > 0.9)) {
    gameOver();
    return;
  }

  if (invaders.shot) {
    const hit = liveAliens.find((alien) => {
      return Math.abs(alien.cx - invaders.shot.x) < 0.076 && Math.abs(alien.cy - invaders.shot.y) < 0.06;
    });
    if (hit) {
      hit.ref.alive = false;
      state.score += 1;
      scoreNode.textContent = String(state.score).padStart(2, "0");
      invaders.shot = null;
      addParticlesNormalized(hit.cx, hit.cy);
      tg?.HapticFeedback?.impactOccurred("light");
      if (positionedAliens().every((alien) => !alien.alive)) levelUp();
    }
  }
}

function launchBreakoutBall() {
  const breakout = state.breakout;
  if (!breakout) return;
  breakout.launched = true;
}

function updateBreakoutGame(delta) {
  const breakout = state.breakout;
  if (!breakout) return;
  breakout.paddleX = Math.max(0.14, Math.min(0.86, breakout.paddleX + breakout.paddleDir * delta * 0.78));

  const ball = breakout.ball;
  if (!breakout.launched) {
    ball.x = breakout.paddleX;
    ball.y = 0.76;
    return;
  }

  ball.x += ball.vx * delta;
  ball.y += ball.vy * delta;

  if (ball.x < 0.04 || ball.x > 0.96) {
    ball.x = Math.max(0.04, Math.min(0.96, ball.x));
    ball.vx *= -1;
    playTone(523.25, 0.05, 0.35);
  }
  if (ball.y < 0.04) {
    ball.y = 0.04;
    ball.vy = Math.abs(ball.vy);
    playTone(523.25, 0.05, 0.35);
  }

  const paddleHit = ball.y > 0.79 && ball.y < 0.84 && Math.abs(ball.x - breakout.paddleX) < 0.14 && ball.vy > 0;
  if (paddleHit) {
    ball.y = 0.79;
    ball.vy = -Math.abs(ball.vy) * 1.02;
    ball.vx += (ball.x - breakout.paddleX) * 1.1;
    ball.vx = Math.max(-0.56, Math.min(0.56, ball.vx));
    playTone(659.25, 0.06, 0.45);
  }

  const hit = positionedBricks().find((brick) => {
    return brick.alive && Math.abs(brick.cx - ball.x) < 0.075 && Math.abs(brick.cy - ball.y) < 0.04;
  });
  if (hit) {
    hit.ref.alive = false;
    ball.vy *= -1;
    state.score += 1;
    scoreNode.textContent = String(state.score).padStart(2, "0");
    addParticlesNormalized(hit.cx, hit.cy);
    tg?.HapticFeedback?.impactOccurred("light");
    if (positionedBricks().every((brick) => !brick.alive)) levelUp();
  }

  if (ball.y > 1.02) gameOver();
}

function updatePlaying(delta, time) {
  if (state.infoOpen) return;
  if (state.gameType === "pac") updatePacGame(delta, time);
  if (state.gameType === "invaders") updateInvadersGame(delta);
  if (state.gameType === "breakout") updateBreakoutGame(delta);
}

function drawMaze() {
  ctx.lineWidth = 2;
  maze.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      const tx = state.offsetX + x * state.tile;
      const ty = state.offsetY + y * state.tile;
      if (cell === "#") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(tx + 2, ty + 2, state.tile - 4, state.tile - 4);
      }
    });
  });

  ctx.fillStyle = "#fff";
  state.dots.forEach((key) => {
    const [x, y] = key.split(":").map(Number);
    const center = tileCenter(x, y);
    ctx.fillRect(center.x - 2, center.y - 2, 4, 4);
  });
}

function drawPlayer(time) {
  const center = tileCenter(state.player.px, state.player.py);
  const blink = time < state.dangerUntil && Math.floor(time / 80) % 2 === 0;
  if (blink) return;
  const s = state.tile * 0.76;
  ctx.fillStyle = "#fff";
  ctx.fillRect(center.x - s / 2, center.y - s / 2, s, s);
  ctx.fillRect(center.x - s * 0.36, center.y - s * 0.64, s * 0.72, s * 0.18);
  ctx.fillRect(center.x - s * 0.36, center.y + s * 0.46, s * 0.72, s * 0.18);
  ctx.fillStyle = "#0025ff";
  const mouthX = state.player.dirX || state.player.wantX || 1;
  const mouthY = state.player.dirY || state.player.wantY || 0;
  if (Math.abs(mouthX) > Math.abs(mouthY)) {
    const x = mouthX > 0 ? center.x + s * 0.16 : center.x - s * 0.5;
    ctx.fillRect(x, center.y - s * 0.18, s * 0.34, s * 0.36);
  } else {
    const y = mouthY > 0 ? center.y + s * 0.16 : center.y - s * 0.5;
    ctx.fillRect(center.x - s * 0.18, y, s * 0.36, s * 0.34);
  }
  ctx.fillRect(center.x - s * 0.12, center.y - s * 0.28, s * 0.14, s * 0.14);
}

function drawEnemies() {
  state.enemies.forEach((enemy) => {
    const center = tileCenter(enemy.px, enemy.py);
    const s = state.tile * 0.64;
    ctx.fillStyle = "#fff";
    ctx.fillRect(center.x - s / 2, center.y - s * 0.32, s, s * 0.64);
    ctx.fillRect(center.x - s * 0.36, center.y - s * 0.5, s * 0.72, s * 0.28);
    ctx.fillRect(center.x - s * 0.5, center.y - s * 0.22, s * 0.2, s * 0.2);
    ctx.fillRect(center.x + s * 0.3, center.y - s * 0.22, s * 0.2, s * 0.2);
    ctx.fillRect(center.x - s * 0.5, center.y + s * 0.22, s * 0.22, s * 0.22);
    ctx.fillRect(center.x - s * 0.1, center.y + s * 0.22, s * 0.22, s * 0.22);
    ctx.fillRect(center.x + s * 0.28, center.y + s * 0.22, s * 0.22, s * 0.22);
    ctx.fillStyle = "#0025ff";
    ctx.fillRect(center.x - s * 0.24, center.y - s * 0.18, s * 0.12, s * 0.12);
    ctx.fillRect(center.x + s * 0.14, center.y - s * 0.18, s * 0.12, s * 0.12);
  });
}

function drawParticles(delta) {
  ctx.fillStyle = "#fff";
  state.particles = state.particles.filter((particle) => {
    particle.life -= delta;
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    const alpha = Math.max(0, particle.life / 0.42);
    ctx.globalAlpha = alpha;
    ctx.fillRect(particle.x, particle.y, 5, 5);
    ctx.globalAlpha = 1;
    return particle.life > 0;
  });
}

function drawArenaFrame() {
  const area = gameArea();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.strokeRect(area.x, area.y, area.w, area.h);
  return area;
}

function fillPixelRect(area, nx, ny, nw, nh) {
  ctx.fillRect(
    Math.round(area.x + nx * area.w),
    Math.round(area.y + ny * area.h),
    Math.round(nw * area.w),
    Math.round(nh * area.h),
  );
}

function drawInvaderShape(area, nx, ny) {
  ctx.fillStyle = "#fff";
  fillPixelRect(area, nx - 0.028, ny - 0.022, 0.056, 0.044);
  fillPixelRect(area, nx - 0.042, ny - 0.006, 0.014, 0.03);
  fillPixelRect(area, nx + 0.028, ny - 0.006, 0.014, 0.03);
  fillPixelRect(area, nx - 0.018, ny + 0.022, 0.012, 0.018);
  fillPixelRect(area, nx + 0.006, ny + 0.022, 0.012, 0.018);
  ctx.fillStyle = "#0025ff";
  fillPixelRect(area, nx - 0.016, ny - 0.006, 0.008, 0.008);
  fillPixelRect(area, nx + 0.008, ny - 0.006, 0.008, 0.008);
}

function drawInvaders() {
  const area = drawArenaFrame();
  ctx.fillStyle = "#fff";
  positionedAliens().forEach((alien) => {
    if (alien.alive) drawInvaderShape(area, alien.cx, alien.cy);
  });

  const invaders = state.invaders;
  if (!invaders) return;
  ctx.fillStyle = "#fff";
  fillPixelRect(area, invaders.playerX - 0.045, 0.86, 0.09, 0.035);
  fillPixelRect(area, invaders.playerX - 0.016, 0.825, 0.032, 0.04);

  if (invaders.shot) {
    fillPixelRect(area, invaders.shot.x - 0.006, invaders.shot.y - 0.035, 0.012, 0.07);
  }

  ctx.fillStyle = "#fff";
  for (let i = 0; i < 9; i += 1) {
    fillPixelRect(area, 0.12 + i * 0.095, 0.58, 0.012, 0.012);
  }
}

function drawBreakout() {
  const area = drawArenaFrame();
  ctx.fillStyle = "#fff";
  positionedBricks().forEach((brick) => {
    if (!brick.alive) return;
    fillPixelRect(area, brick.cx - 0.052, brick.cy - 0.024, 0.104, 0.044);
  });

  const breakout = state.breakout;
  if (!breakout) return;
  fillPixelRect(area, breakout.paddleX - 0.12, 0.86, 0.24, 0.032);
  const ball = breakout.ball;
  fillPixelRect(area, ball.x - 0.018, ball.y - 0.018, 0.036, 0.036);

  if (!breakout.launched) {
    ctx.font = "700 13px Courier New, monospace";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText("PRESS UP", area.x + area.w / 2, area.y + area.h * 0.68);
  }
}

function render(time = 0) {
  const delta = Math.min(0.032, (time - state.lastFrame) / 1000 || 0);
  state.lastFrame = time;

  ctx.clearRect(0, 0, state.width, state.height);

  if (state.mode === "playing") updatePlaying(delta, time);

  if ((state.mode === "playing" || state.mode === "prize" || state.mode === "gameover") && state.gameType === "pac") {
    drawMaze();
    drawParticles(state.mode === "playing" ? delta : 0);
    drawEnemies();
    drawPlayer(time);
  }

  if ((state.mode === "playing" || state.mode === "prize" || state.mode === "gameover") && state.gameType === "invaders") {
    drawInvaders();
    drawParticles(state.mode === "playing" ? delta : 0);
  }

  if ((state.mode === "playing" || state.mode === "prize" || state.mode === "gameover") && state.gameType === "breakout") {
    drawBreakout();
    drawParticles(state.mode === "playing" ? delta : 0);
  }

  drawFlash(time);

  requestAnimationFrame(render);
}

function drawFlash(time) {
  if (!state.flash || state.mode !== "playing") return;
  if (time > state.flash.until) {
    state.flash = null;
    return;
  }
  const remain = state.flash.until - time;
  ctx.save();
  ctx.globalAlpha = Math.min(1, remain / 300);
  const size = Math.round(state.width * 0.085);
  ctx.font = `900 ${size}px "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = state.width / 2;
  const cy = state.height * 0.46;
  const boxW = ctx.measureText(state.flash.text).width + 44;
  const boxH = size + 28;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);
  ctx.fillStyle = "#0025ff";
  ctx.fillText(state.flash.text, cx, cy + 2);
  ctx.restore();
}

function bindPad(button, x, y) {
  button.addEventListener("pointerdown", () => setDirection(x, y));
  button.addEventListener("pointerup", () => {
    if (state.gameType !== "pac" && x !== 0) setDirection(0, 0);
  });
  button.addEventListener("pointercancel", () => {
    if (state.gameType !== "pac" && x !== 0) setDirection(0, 0);
  });
}

window.addEventListener("pointerdown", unlockAudio);

startButton.addEventListener("click", () => startGame());
znwrButton.addEventListener("click", openZnwrSite);
againButton.addEventListener("click", () => startGame());
otherGamesButton.addEventListener("click", returnToMenu);
restartButton.addEventListener("click", () => startGame());
gameoverMenuButton.addEventListener("click", returnToMenu);
soundButton.addEventListener("click", toggleSound);
menuButton.addEventListener("click", returnToMenu);
saleButton.addEventListener("click", openSaleInfo);
ratingButton.addEventListener("click", openRating);
ratingIntroButton.addEventListener("click", openRating);
ratingCloseButton.addEventListener("click", closeRating);
instagramShareButton.addEventListener("click", () => {
  shareToInstagram().catch(() => {});
});
prizeShareButton.addEventListener("click", () => {
  shareToInstagram().catch(() => {});
});
saleDetailsButton.addEventListener("click", openSaleDetails);
saleChannelButton.addEventListener("click", openSaleChannel);
saleCloseButton.addEventListener("click", closeSaleInfo);
rulesIntroButton.addEventListener("click", openRules);
rulesButton.addEventListener("click", openRules);
rulesCloseButton.addEventListener("click", closeRules);
tgShareButton.addEventListener("click", shareToTelegram);
prizeTgButton.addEventListener("click", shareToTelegram);
prizeSaleButton.addEventListener("click", () => {
  prizePanel.hidden = true;
  openSaleInfo();
});

bindPad(upButton, 0, -1);
bindPad(downButton, 0, 1);
bindPad(leftButton, -1, 0);
bindPad(rightButton, 1, 0);

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp") setDirection(0, -1);
  if (event.key === "ArrowDown") setDirection(0, 1);
  if (event.key === "ArrowLeft") setDirection(-1, 0);
  if (event.key === "ArrowRight") setDirection(1, 0);
  if (event.key === "Enter" && state.mode !== "playing") startGame();
});

window.addEventListener("keyup", (event) => {
  if (state.gameType === "pac") return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") setDirection(0, 0);
});

canvas.addEventListener("pointerdown", (event) => {
  if (state.mode !== "playing") return;
  if (state.gameType === "invaders") {
    fireInvaderShot();
    return;
  }
  if (state.gameType === "breakout") {
    launchBreakoutBall();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const center = tileCenter(state.player.px, state.player.py);
  const dx = x - center.x;
  const dy = y - center.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    setDirection(Math.sign(dx), 0);
  } else {
    setDirection(0, Math.sign(dy));
  }
});

gameButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectGame(button.dataset.game);
    playTone(783.99, 0.05, 0.35);
  });
});

window.addEventListener("resize", resize);

resize();
resetGame();
fetchLeaderboard();
logEvent("app_open");
if (urlParams.get("debugResult") === "1") {
  localStorage.setItem(ratingStorageKey, JSON.stringify({
    games: {
      pac: {
        name: localPlayerName(),
        gameType: "pac",
        game: gameModes.pac.label,
        score: gameModes.pac.target,
        seconds: 42,
        outcome: "win",
      },
      invaders: {
        name: localPlayerName(),
        gameType: "invaders",
        game: gameModes.invaders.label,
        score: gameModes.invaders.target,
        seconds: 34,
        outcome: "win",
      },
    },
  }));
  updateResultPanel();
  prizePanel.hidden = false;
  setMode("prize");
}
updateSoundButton();
requestAnimationFrame(render);

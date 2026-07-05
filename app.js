const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor("#0025ff");
  tg.setBackgroundColor("#0025ff");
}

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
const ratingMenuButton = document.querySelector("#ratingMenuButton");
const salePanel = document.querySelector("#salePanel");
const saleDetailsBlock = document.querySelector("#saleDetailsBlock");
const saleDetailsButton = document.querySelector("#saleDetailsButton");
const saleChannelButton = document.querySelector("#saleChannelButton");
const saleCloseButton = document.querySelector("#saleCloseButton");
const saleMenuButton = document.querySelector("#saleMenuButton");
const rulesPanel = document.querySelector("#rulesPanel");
const rulesIntroButton = document.querySelector("#rulesIntroButton");
const rulesButton = document.querySelector("#rulesButton");
const rulesCloseButton = document.querySelector("#rulesCloseButton");
const rulesMenuButton = document.querySelector("#rulesMenuButton");
const tgShareButton = document.querySelector("#tgShareButton");
const prizeSaleButton = document.querySelector("#prizeSaleButton");
const againButton = document.querySelector("#againButton");
const otherGamesButton = document.querySelector("#otherGamesButton");
const restartButton = document.querySelector("#restartButton");
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
const repostStorageKey = "znwr-garage-sale-repost";
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

const state = {
  mode: "intro",
  gameType: "pac",
  score: 0,
  target: 24,
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
  targetNode.textContent = String(mode.target).padStart(2, "0");
  gameLabelNode.textContent = mode.label;
}

function resetGame() {
  updateGameChrome();
  state.score = 0;
  state.gameStartedAt = Date.now();
  state.particles = [];
  state.dangerUntil = 0;
  scoreNode.textContent = "00";
  if (state.gameType === "pac") resetPacGame();
  if (state.gameType === "invaders") resetInvadersGame();
  if (state.gameType === "breakout") resetBreakoutGame();
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
    alienSpeed: 0.075,
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
  state.breakout = {
    paddleX: 0.5,
    paddleDir: 0,
    launched: false,
    ball: { x: 0.5, y: 0.76, vx: 0.28, vy: -0.42 },
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
  stopMusic();
  state.infoOpen = false;
  salePanel.hidden = true;
  ratingPanel.hidden = true;
  prizePanel.hidden = true;
  gameoverPanel.hidden = true;
  rulesPanel.hidden = true;
  setMode("intro");
  resetGame();
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
  const text = place
    ? `Я #${place} в рейтинге ZNWR Arcade Sale. Сыграй и попробуй обогнать — скидки 20-90% и розыгрыш плаща инженера!`
    : "Играю в ZNWR Arcade Sale — скидки 20-90% и розыгрыш плаща инженера. Залетай!";
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(botShareUrl)}&text=${encodeURIComponent(text)}`;
  logEvent("tg_share_intent", { rating_place: place || "" });
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, "_blank", "noopener");
  }
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

function hasRepostBoost() {
  return localStorage.getItem(repostStorageKey) === "on";
}

function chanceMultiplier() {
  return hasRepostBoost() ? 2 : 1;
}

function updateChanceUi() {
  chanceText.textContent = `ШАНС В РОЗЫГРЫШЕ: X${chanceMultiplier()}`;
  instagramShareButton.textContent = hasRepostBoost() ? "X2 ACTIVE" : "SHARE TO INSTA";
  instagramShareButton.disabled = false;
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
    chance_multiplier: chanceMultiplier(),
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
          chance: Number(player.chance) || 1,
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
    ? { ...localRating, key: localKey, chance: chanceMultiplier(), isLocal: true }
    : null;
  const base = serverLeaders
    ? serverLeaders.filter((row) => row.key !== localKey)
    : demoLeaders;
  const serverSelf = serverLeaders?.find((row) => row.key === localKey) || null;
  const rows = base.slice();
  if (boostedRating && serverSelf && serverSelf.rating > boostedRating.rating) {
    rows.push({ ...serverSelf, chance: boostedRating.chance, isLocal: true });
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

function calculateGameRating(result) {
  const mode = gameModes[result.gameType] || gameModes.pac;
  const completion = Math.min(result.score, mode.target) / mode.target;
  const base = completion * 1000;
  const speedBonus = completion >= 1
    ? Math.max(0, (mode.parSeconds - result.seconds) / mode.parSeconds) * 250
    : 0;
  return Math.round((base + speedBonus) * mode.coefficient);
}

function aggregateLocalRating() {
  const rating = getStoredRating();
  const results = Object.values(rating.games || {});
  if (!results.length) return null;
  const totalRating = results.reduce((sum, result) => sum + calculateGameRating(result), 0);
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
    resultPlaceNode.textContent = "RATING";
    resultSummaryNode.textContent = "СЫГРАЙ, ЧТОБЫ ПОПАСТЬ В РЕЙТИНГ";
    resultBestGameNode.textContent = "";
  } else {
    resultPlaceNode.textContent = place ? `#${place}` : "RATING";
    resultSummaryNode.textContent = `${aggregate.rating} PTS · ${aggregate.gamesDone}/3 GAMES`;
    resultBestGameNode.textContent = `BEST ${aggregate.bestGame}`;
  }
  resultChanceNode.textContent = `ШАНС В РОЗЫГРЫШЕ: X${chanceMultiplier()}`;
  prizeShareButton.textContent = hasRepostBoost() ? "ШАНС X2 АКТИВЕН" : "УДВОИТЬ ШАНС";
  prizeShareButton.disabled = false;
}

function renderRating() {
  ratingList.innerHTML = "";
  updateChanceUi();
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
    game.textContent = `${row.gamesDone}/3 · BEST ${row.bestGame}`;
    score.textContent = `${row.rating} PTS`;
    if (row.chance === 2) score.textContent += " X2";
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

function drawStoryLine(targetCtx, text, x, y, size, align = "left", color = "#ffffff") {
  targetCtx.fillStyle = color;
  targetCtx.font = `900 ${size}px Courier New, monospace`;
  targetCtx.textAlign = align;
  targetCtx.textBaseline = "middle";
  targetCtx.fillText(text, x, y);
}

function drawPixelMark(targetCtx, x, y, scale = 1) {
  targetCtx.fillStyle = "#ffffff";
  const s = 28 * scale;
  targetCtx.fillRect(x + s, y, s, s);
  targetCtx.fillRect(x + s * 3, y, s, s);
  targetCtx.fillRect(x + s * 2, y + s, s, s);
  targetCtx.fillRect(x + s, y + s * 2, s, s);
  targetCtx.fillRect(x + s * 3, y + s * 2, s, s);
}

function shareImageBlob() {
  const rating = aggregateLocalRating();
  const currentRating = rating?.rating || 0;
  const currentGame = rating?.bestGame || gameModes[state.gameType].label;
  const gamesDone = rating?.gamesDone || 0;
  const totalSeconds = rating?.totalSeconds || getPlaySeconds();
  const ratingPlace = localRatingPlace();
  const ratingText = ratingPlace ? `МОЙ РЕЙТИНГ #${ratingPlace}` : "Я В РЕЙТИНГЕ";
  const story = document.createElement("canvas");
  story.width = 1080;
  story.height = 1920;
  const storyCtx = story.getContext("2d");
  storyCtx.fillStyle = "#0025ff";
  storyCtx.fillRect(0, 0, story.width, story.height);
  storyCtx.strokeStyle = "#ffffff";
  storyCtx.lineWidth = 10;
  storyCtx.strokeRect(70, 70, 940, 1780);
  storyCtx.strokeRect(120, 125, 840, 1670);
  drawPixelMark(storyCtx, 770, 185, 1.3);
  drawPixelMark(storyCtx, 120, 1450, 0.9);
  drawPixelMark(storyCtx, 800, 1510, 0.9);

  drawStoryLine(storyCtx, "ZNWR", 150, 210, 52);
  drawStoryLine(storyCtx, "ARCADE", 150, 305, 112);
  drawStoryLine(storyCtx, "SALE", 150, 420, 112);
  drawStoryLine(storyCtx, "10-12 ИЮЛЯ", 150, 540, 46);
  drawStoryLine(storyCtx, "ХЛЕБОЗАВОД, НЕМИГА", 150, 610, 36);

  storyCtx.fillStyle = "#ffffff";
  storyCtx.fillRect(150, 700, 780, 8);
  drawStoryLine(storyCtx, "Я УЧАСТВУЮ В", 150, 800, 54);
  drawStoryLine(storyCtx, "GARAGE + SAMPLE SALE", 150, 890, 50);
  drawStoryLine(storyCtx, "СКИДКИ 20-90%", 150, 980, 82);

  storyCtx.fillStyle = "#ffffff";
  storyCtx.fillRect(150, 1050, 780, 280);
  storyCtx.fillStyle = "#0025ff";
  drawStoryLine(storyCtx, ratingText, 540, 1115, 68, "center", "#0025ff");
  drawStoryLine(storyCtx, `${currentRating} RATING PTS`, 540, 1200, 50, "center", "#0025ff");
  drawStoryLine(storyCtx, `${gamesDone}/3 GAMES · ${totalSeconds} SEC`, 540, 1260, 40, "center", "#0025ff");
  drawStoryLine(storyCtx, `BEST ${currentGame}`, 540, 1310, 34, "center", "#0025ff");

  drawStoryLine(storyCtx, `ШАНС НА ПЛАЩ X${chanceMultiplier()}`, 150, 1430, 52);
  drawStoryLine(storyCtx, "ЗАХОДИ В БОТА:", 150, 1580, 44);
  drawStoryLine(storyCtx, botShareUrl.replace(/^https?:\/\//, ""), 150, 1660, 48);
  drawCenteredText(storyCtx, "PLAY / SHARE / WIN", 1775, 42);
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
  instagramShareButton.textContent = "MAKING PNG";
  prizeShareButton.textContent = "MAKING PNG";
  try {
    const blob = await shareImageBlob();
    const file = new File([blob], "znwr-arcade-sale.png", { type: "image/png" });
    const shareData = {
      title: "ZNWR Arcade Sale",
      text: `Я участвую в ZNWR Arcade Sale. Заходи в бота: ${botShareUrl}`,
      files: [file],
    };

    if (navigator.canShare?.(shareData)) {
      instagramShareButton.textContent = "OPEN SHARE";
      prizeShareButton.textContent = "OPEN SHARE";
      await navigator.share(shareData);
    } else {
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = "znwr-arcade-sale.png";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
    }

    localStorage.setItem(repostStorageKey, "on");
    updateChanceUi();
    updateResultPanel();
    renderRating();
    logEvent("instagram_share_intent", { chance_multiplier: 2 });
    tg?.HapticFeedback?.notificationOccurred("success");
  } catch (error) {
    updateChanceUi();
    updateResultPanel();
    logEvent("instagram_share_cancelled");
  }
}

function unlockPrize() {
  recordRatingResult("win");
  updateResultPanel();
  fetchLeaderboard(true).then(() => {
    if (!prizePanel.hidden) updateResultPanel();
  });
  prizePanel.hidden = false;
  gameoverPanel.hidden = true;
  setMode("prize");
  softenMusic();
  playWinJingle();
  const aggregate = aggregateLocalRating();
  logEvent("game_complete", {
    total_rating: aggregate?.rating || 0,
    games_done: aggregate?.gamesDone || 0,
    rating_place: localRatingPlace() || "",
    chance_multiplier: chanceMultiplier(),
  });
  tg?.HapticFeedback?.notificationOccurred("success");
}

function gameOver() {
  recordRatingResult("game_over");
  gameoverPanel.hidden = false;
  prizePanel.hidden = true;
  setMode("gameover");
  stopMusic();
  playGameOverJingle();
  logEvent("game_over");
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
  if (state.soundEnabled && state.mode === "playing") startMusic();
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
    advanceActor(enemy, 3.1, delta);
  });
}

function collectCurrentTile() {
  const key = keyOf(state.player.x, state.player.y);
  if (state.dots.delete(key)) {
    state.score += 1;
    scoreNode.textContent = String(state.score).padStart(2, "0");
    addParticles(state.player.x, state.player.y);
    tg?.HapticFeedback?.impactOccurred("light");
    if (state.score >= state.target) unlockPrize();
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
    invaders.alienOffsetY += 0.025;
    invaders.alienSpeed = Math.min(0.13, invaders.alienSpeed + 0.006);
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
      if (state.score >= state.target) unlockPrize();
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
    if (state.score >= state.target) unlockPrize();
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

  requestAnimationFrame(render);
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

startButton.addEventListener("click", () => startGame());
znwrButton.addEventListener("click", openZnwrSite);
againButton.addEventListener("click", () => startGame());
otherGamesButton.addEventListener("click", returnToMenu);
restartButton.addEventListener("click", () => startGame());
soundButton.addEventListener("click", toggleSound);
menuButton.addEventListener("click", returnToMenu);
saleButton.addEventListener("click", openSaleInfo);
ratingButton.addEventListener("click", openRating);
ratingIntroButton.addEventListener("click", openRating);
ratingCloseButton.addEventListener("click", closeRating);
ratingMenuButton.addEventListener("click", returnToMenu);
instagramShareButton.addEventListener("click", () => {
  shareToInstagram().catch(() => {});
});
prizeShareButton.addEventListener("click", () => {
  shareToInstagram().catch(() => {});
});
saleDetailsButton.addEventListener("click", openSaleDetails);
saleChannelButton.addEventListener("click", openSaleChannel);
saleCloseButton.addEventListener("click", closeSaleInfo);
saleMenuButton.addEventListener("click", returnToMenu);
rulesIntroButton.addEventListener("click", openRules);
rulesButton.addEventListener("click", openRules);
rulesCloseButton.addEventListener("click", closeRules);
rulesMenuButton.addEventListener("click", returnToMenu);
tgShareButton.addEventListener("click", shareToTelegram);
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

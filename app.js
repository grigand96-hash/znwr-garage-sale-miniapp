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
const startButton = document.querySelector("#startButton");
const copyButton = document.querySelector("#copyButton");
const againButton = document.querySelector("#againButton");
const restartButton = document.querySelector("#restartButton");
const prizePanel = document.querySelector("#prizePanel");
const gameoverPanel = document.querySelector("#gameoverPanel");
const promoCodeNode = document.querySelector("#promoCode");
const soundButton = document.querySelector("#soundButton");
const upButton = document.querySelector("#upButton");
const downButton = document.querySelector("#downButton");
const leftButton = document.querySelector("#leftButton");
const rightButton = document.querySelector("#rightButton");

const promoCodes = ["ZNWR-80S-10", "GARAGE-15", "NEMIGA-20", "BREAD-1986", "SALE-BOSS"];
const storageKey = "znwr-garage-sale-promo";
const soundStorageKey = "znwr-garage-sale-sound";
const analyticsEndpoint = "";
const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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
  particles: [],
  lastFrame: 0,
  gameStartedAt: 0,
  dangerUntil: 0,
  promo: localStorage.getItem(storageKey) || "",
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

function resetGame() {
  state.score = 0;
  state.gameStartedAt = Date.now();
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
  state.particles = [];
  state.dangerUntil = 0;
  scoreNode.textContent = "00";
}

function choosePromo() {
  if (state.promo) return state.promo;
  const index = Math.floor(Math.random() * promoCodes.length);
  state.promo = promoCodes[index];
  localStorage.setItem(storageKey, state.promo);
  return state.promo;
}

function startGame() {
  prizePanel.hidden = true;
  gameoverPanel.hidden = true;
  resetGame();
  setMode("playing");
  resize();
  startMusic();
  logEvent("game_start");
  tg?.HapticFeedback?.impactOccurred("medium");
}

function unlockPrize() {
  const promo = choosePromo();
  promoCodeNode.textContent = promo;
  prizePanel.hidden = false;
  gameoverPanel.hidden = true;
  setMode("prize");
  softenMusic();
  playWinJingle();
  logEvent("promo_unlocked", { promo });
  tg?.HapticFeedback?.notificationOccurred("success");
}

function gameOver() {
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
    timestamp: new Date().toISOString(),
    score: state.score,
    target: state.target,
    play_seconds: getPlaySeconds(),
    mode: state.mode,
    sound_enabled: state.soundEnabled,
    promo: state.promo || "",
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
  state.player.wantX = x;
  state.player.wantY = y;
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

function updatePlaying(delta, time) {
  movePlayer(delta);
  collectCurrentTile();
  updateEnemies(delta);
  handleEnemyHit(time);
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

function render(time = 0) {
  const delta = Math.min(0.032, (time - state.lastFrame) / 1000 || 0);
  state.lastFrame = time;

  ctx.clearRect(0, 0, state.width, state.height);

  if (state.mode === "playing") updatePlaying(delta, time);

  if (state.mode === "playing" || state.mode === "prize" || state.mode === "gameover") {
    drawMaze();
    drawParticles(state.mode === "playing" ? delta : 0);
    drawEnemies();
    drawPlayer(time);
  }

  requestAnimationFrame(render);
}

function bindPad(button, x, y) {
  button.addEventListener("pointerdown", () => setDirection(x, y));
}

function copyPromo() {
  navigator.clipboard?.writeText(state.promo);
  copyButton.textContent = "COPIED";
  logEvent("promo_copied");
  tg?.HapticFeedback?.impactOccurred("light");
  setTimeout(() => {
    copyButton.textContent = "COPY";
  }, 1200);
}

startButton.addEventListener("click", startGame);
againButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
copyButton.addEventListener("click", copyPromo);
soundButton.addEventListener("click", toggleSound);

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

canvas.addEventListener("pointerdown", (event) => {
  if (state.mode !== "playing") return;
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

window.addEventListener("resize", resize);

resize();
resetGame();
if (state.promo) {
  promoCodeNode.textContent = state.promo;
}

updateSoundButton();
requestAnimationFrame(render);

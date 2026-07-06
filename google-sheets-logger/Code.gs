const SHEET_NAME = "events";
const RATING_SHEET_NAME = "rating";
const HEADERS = [
  "server_time",
  "client_time",
  "event",
  "session_id",
  "telegram_verified",
  "telegram_user_id",
  "telegram_username",
  "telegram_first_name",
  "telegram_last_name",
  "score",
  "target",
  "play_seconds",
  "outcome",
  "result_score",
  "result_seconds",
  "game_rating",
  "total_rating",
  "games_done",
  "share_source",
  "share_count",
  "source_count",
  "telegram_share_count",
  "instagram_share_count",
  "share_points",
  "chance_multiplier",
  "mode",
  "sound_enabled",
  "promo",
  "app_url",
  "user_agent",
  "game_type",
  "src",
];
const RATING_HEADERS = [
  "player_key",
  "name",
  "telegram_user_id",
  "telegram_username",
  "pac_rating",
  "pac_seconds",
  "invaders_rating",
  "invaders_seconds",
  "breakout_rating",
  "breakout_seconds",
  "total_rating",
  "games_done",
  "best_game",
  "total_seconds",
  "chance_multiplier",
  "updated_at",
  "share_count",
  "telegram_share_count",
  "instagram_share_count",
  "share_points",
];
const GAME_TYPES = ["pac", "invaders", "breakout"];
const SHARE_BONUS_POINTS = 150;
const SHARE_BONUS_DECAY = 0.5;
const SHARE_BONUS_MAX_PER_SOURCE = 6;
const MAX_SCORE_MULTIPLIER = 12;
const GAME_LABELS = {
  pac: "PAC SALE",
  invaders: "CODE INVADERS",
  breakout: "PROMO BREAKOUT",
};
const GAME_SETTINGS = {
  pac: { target: 24, coefficient: 1 },
  invaders: { target: 10, coefficient: 1.12 },
  breakout: { target: 18, coefficient: 1.06 },
};
// Salt for the public player key hash — hides raw Telegram ids from the public
// leaderboard while staying stable so the client can spot its own row.
const PUBLIC_KEY_SALT = "znwr-arcade:";
// Max writes per identity per minute before we drop the request (anti-spam).
const RATE_LIMIT_PER_MINUTE = 60;

function drawSecret_() {
  try {
    return PropertiesService.getScriptProperties().getProperty("DRAW_SECRET") || "";
  } catch (error) {
    return "";
  }
}

function publicKey_(rawKey) {
  if (!rawKey) return "";
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    PUBLIC_KEY_SALT + rawKey,
    Utilities.Charset.UTF_8,
  );
  let hex = "";
  for (let i = 0; i < 6; i += 1) {
    const b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += b.toString(16).padStart(2, "0");
  }
  return `h:${hex}`;
}

function rateLimited_(payload) {
  try {
    const id = String(payload.session_id || payload.telegram_user_id || "");
    if (!id) return false;
    const cache = CacheService.getScriptCache();
    const bucket = `rl:${id}`;
    const count = Number(cache.get(bucket) || 0) + 1;
    cache.put(bucket, String(count), 60);
    return count > RATE_LIMIT_PER_MINUTE;
  } catch (error) {
    return false;
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    if (rateLimited_(payload)) return json_({ ok: false, error: "rate_limited" });
    const props = PropertiesService.getScriptProperties();
    const spreadsheetId = props.getProperty("SPREADSHEET_ID");
    const botToken = props.getProperty("BOT_TOKEN");

    if (!spreadsheetId) {
      throw new Error("Missing SPREADSHEET_ID script property");
    }

    const verification = verifyTelegramInitData(payload.telegram_init_data || "", botToken);
    const sheet = getEventsSheet_(spreadsheetId);
    const row = [
      new Date(),
      payload.timestamp || "",
      payload.event || "",
      payload.session_id || "",
      verification.ok ? "ok" : verification.reason,
      payload.telegram_user_id || "",
      payload.telegram_username || "",
      payload.telegram_first_name || "",
      payload.telegram_last_name || "",
      payload.score || 0,
      payload.target || 0,
      payload.play_seconds || 0,
      payload.outcome || "",
      payload.result_score || "",
      payload.result_seconds || "",
      payload.game_rating || "",
      payload.total_rating || "",
      payload.games_done || "",
      payload.share_source || "",
      payload.share_count || "",
      payload.source_count || "",
      payload.telegram_share_count || "",
      payload.instagram_share_count || "",
      payload.share_points || "",
      payload.chance_multiplier || "",
      payload.mode || "",
      payload.sound_enabled === true,
      payload.promo || "",
      payload.app_url || "",
      payload.user_agent || "",
      payload.game_type || "",
      payload.src || "",
    ];

    sheet.appendRow(row);
    handleRatingEvent_(spreadsheetId, payload, verification.ok, Boolean(botToken));
    return json_({ ok: true });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function doGet(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const spreadsheetId = props.getProperty("SPREADSHEET_ID");
    if (!spreadsheetId) {
      throw new Error("Missing SPREADSHEET_ID script property");
    }
    const action = String(e?.parameter?.action || "rating");
    if (action === "draw") return handleDrawGet_(spreadsheetId, e);
    return handleRatingGet_(spreadsheetId, e);
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

// Public leaderboard: hashed keys (no raw tg ids), capped list.
function handleRatingGet_(spreadsheetId, e) {
  const limit = Math.min(Math.max(Number(e?.parameter?.limit) || 10, 1), 200);
  const sheet = getRatingSheet_(spreadsheetId);
  const rows = sheet.getDataRange().getValues().slice(1);
  const players = rows
    .map((row) => ({
      key: publicKey_(String(row[0] || "")),
      name: String(row[1] || "PLAYER"),
      rating: Number(row[10]) || 0,
      gamesDone: Number(row[11]) || 0,
      bestGame: String(row[12] || GAME_LABELS.pac),
      totalSeconds: Number(row[13]) || 0,
      chance: Number(row[14]) || 1,
    }))
    .filter((player) => player.key && player.rating > 0)
    .sort((a, b) => b.rating - a.rating || b.gamesDone - a.gamesDone || a.totalSeconds - b.totalSeconds)
    .slice(0, limit);
  return json_({ ok: true, players });
}

// Private draw endpoint: the FULL sheet with raw keys so the raffle can reach
// the winner and no participant is silently truncated. Guarded by DRAW_SECRET
// when set; while empty it stays open (and says so via `guarded`).
function handleDrawGet_(spreadsheetId, e) {
  const secret = drawSecret_();
  const guarded = Boolean(secret);
  if (guarded && String(e?.parameter?.secret || "") !== secret) {
    return json_({ ok: false, error: "forbidden" });
  }
  const sheet = getRatingSheet_(spreadsheetId);
  const rows = sheet.getDataRange().getValues().slice(1);
  const players = rows
    .map((row) => ({
      key: String(row[0] || ""),
      name: String(row[1] || "PLAYER"),
      userId: String(row[2] || ""),
      username: String(row[3] || ""),
      rating: Number(row[10]) || 0,
      gamesDone: Number(row[11]) || 0,
      bestGame: String(row[12] || GAME_LABELS.pac),
      totalSeconds: Number(row[13]) || 0,
    }))
    .filter((player) => player.key && player.rating > 0)
    .sort((a, b) => b.rating - a.rating || b.gamesDone - a.gamesDone || a.totalSeconds - b.totalSeconds);
  return json_({ ok: true, guarded, count: players.length, players });
}

function handleRatingEvent_(spreadsheetId, payload, verified, tokenConfigured) {
  const event = payload.event || "";
  if (
    event !== "rating_result"
    && event !== "share_bonus"
    && event !== "telegram_share_confirmed"
    && event !== "instagram_story_mention"
  ) return;
  // With BOT_TOKEN configured, only Telegram-signed events may enter the public rating.
  if (tokenConfigured && !verified) return;
  const key = playerKey_(payload);
  if (!key) return;
  // Only Telegram players enter the rating sheet: anonymous players can't be
  // reached for the prize and their anon:<session> key is regenerated on every
  // page load, which is the main sheet-bloat vector. Anons still see their own
  // standing locally on the client.
  if (key.indexOf("tg:") !== 0) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sheet = getRatingSheet_(spreadsheetId);
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === key) {
        rowIndex = i;
        break;
      }
    }

    const record = rowIndex === -1 ? emptyRatingRecord_(key) : ratingRecordFromRow_(data[rowIndex]);
    applyPayloadToRecord_(record, payload);
    const rowValues = ratingRowFromRecord_(record);
    if (rowIndex === -1) {
      sheet.appendRow(rowValues);
    } else {
      sheet.getRange(rowIndex + 1, 1, 1, rowValues.length).setValues([rowValues]);
    }
  } finally {
    lock.releaseLock();
  }
}

function playerKey_(payload) {
  if (payload.telegram_user_id) return `tg:${payload.telegram_user_id}`;
  if (payload.session_id) return `anon:${payload.session_id}`;
  return "";
}

function playerName_(payload, fallback) {
  if (payload.telegram_username) return `@${payload.telegram_username}`;
  if (payload.telegram_first_name) return String(payload.telegram_first_name);
  return fallback || "PLAYER";
}

function emptyRatingRecord_(key) {
  return {
    key,
    name: "PLAYER",
    userId: "",
    username: "",
    games: {
      pac: { rating: 0, seconds: 0 },
      invaders: { rating: 0, seconds: 0 },
      breakout: { rating: 0, seconds: 0 },
    },
    chance: 1,
    shareCount: 0,
    telegramShareCount: 0,
    instagramShareCount: 0,
  };
}

function ratingRecordFromRow_(row) {
  const legacyShareCount = Number(row[16]) || 0;
  return {
    key: String(row[0] || ""),
    name: String(row[1] || "PLAYER"),
    userId: String(row[2] || ""),
    username: String(row[3] || ""),
    games: {
      pac: { rating: Number(row[4]) || 0, seconds: Number(row[5]) || 0 },
      invaders: { rating: Number(row[6]) || 0, seconds: Number(row[7]) || 0 },
      breakout: { rating: Number(row[8]) || 0, seconds: Number(row[9]) || 0 },
    },
    chance: Number(row[14]) || 1,
    shareCount: legacyShareCount,
    telegramShareCount: Number(row[17]) || 0,
    instagramShareCount: Number(row[18]) || legacyShareCount,
  };
}

function applyPayloadToRecord_(record, payload) {
  record.name = playerName_(payload, record.name);
  record.userId = String(payload.telegram_user_id || record.userId || "");
  record.username = String(payload.telegram_username || record.username || "");
  record.chance = Math.max(record.chance, Number(payload.chance_multiplier) || 1);
  if (payload.event === "share_bonus" || payload.event === "telegram_share_confirmed" || payload.event === "instagram_story_mention") {
    applyShareBonus_(record, payload);
  }

  if (payload.event !== "rating_result") return;
  const gameType = String(payload.game_type || "");
  if (GAME_TYPES.indexOf(gameType) === -1) return;
  const seconds = Math.floor(Number(payload.result_seconds) || 0);
  if (seconds < 5 || seconds > 1800) return;
  const rating = calculateServerGameRating_(payload.result_score, gameType);
  if (rating <= 0) return;
  const best = record.games[gameType];
  const isBetter = rating > best.rating || (rating === best.rating && rating > 0 && seconds < best.seconds);
  if (isBetter) {
    record.games[gameType] = { rating, seconds };
  }
}

function applyShareBonus_(record, payload) {
  const source = String(
    payload.share_source
      || (payload.event === "telegram_share_confirmed" ? "telegram" : "")
      || (payload.event === "instagram_story_mention" ? "instagram" : "")
  );
  if (source === "telegram") {
    record.telegramShareCount = Math.min((Number(record.telegramShareCount) || 0) + 1, SHARE_BONUS_MAX_PER_SOURCE);
  } else if (source === "instagram") {
    record.instagramShareCount = Math.min((Number(record.instagramShareCount) || 0) + 1, SHARE_BONUS_MAX_PER_SOURCE);
  }
  record.shareCount = record.telegramShareCount + record.instagramShareCount;
}

function sharePointsForCount_(count) {
  let points = 0;
  const cappedCount = Math.min(Math.max(Number(count) || 0, 0), SHARE_BONUS_MAX_PER_SOURCE);
  for (let index = 0; index < cappedCount; index += 1) {
    points += Math.round(SHARE_BONUS_POINTS * Math.pow(SHARE_BONUS_DECAY, index));
  }
  return points;
}

function sharePointsFromRecord_(record) {
  return sharePointsForCount_(record.telegramShareCount) + sharePointsForCount_(record.instagramShareCount);
}

function calculateServerGameRating_(rawScore, gameType) {
  const settings = GAME_SETTINGS[gameType];
  if (!settings) return 0;
  const score = Math.floor(Number(rawScore) || 0);
  if (score < settings.target) return 0;
  const cappedScore = Math.min(score, settings.target * MAX_SCORE_MULTIPLIER);
  const fullLevels = Math.floor(cappedScore / settings.target);
  const partial = (cappedScore - fullLevels * settings.target) / settings.target;
  let weight = 0;
  for (let k = 1; k <= fullLevels; k += 1) weight += 1 / k;
  weight += partial / (fullLevels + 1);
  return Math.round(weight * 1000 * settings.coefficient);
}

function ratingRowFromRecord_(record) {
  const playedGames = GAME_TYPES.filter((type) => record.games[type].rating > 0);
  // Share bonus counts only after at least one game is played (raffle rule).
  const sharePoints = sharePointsFromRecord_(record);
  const totalRating = playedGames.length
    ? playedGames.reduce((sum, type) => sum + record.games[type].rating, 0) + sharePoints
    : 0;
  const totalSeconds = playedGames.reduce((sum, type) => sum + record.games[type].seconds, 0);
  const bestType = playedGames
    .slice()
    .sort((a, b) => record.games[b].rating - record.games[a].rating)[0];
  return [
    record.key,
    record.name,
    record.userId,
    record.username,
    record.games.pac.rating,
    record.games.pac.seconds,
    record.games.invaders.rating,
    record.games.invaders.seconds,
    record.games.breakout.rating,
    record.games.breakout.seconds,
    totalRating,
    playedGames.length,
    bestType ? GAME_LABELS[bestType] : "",
    totalSeconds,
    record.chance,
    new Date(),
    record.shareCount,
    record.telegramShareCount,
    record.instagramShareCount,
    sharePoints,
  ];
}

function getEventsSheet_(spreadsheetId) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }

  return sheet;
}

function getRatingSheet_(spreadsheetId) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(RATING_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(RATING_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(RATING_HEADERS);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, RATING_HEADERS.length).setValues([RATING_HEADERS]);
  }

  return sheet;
}

function verifyTelegramInitData(initData, botToken) {
  if (!botToken) return { ok: false, reason: "no_bot_token" };
  if (!initData) return { ok: false, reason: "no_init_data" };

  const params = initData.split("&").reduce((acc, pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return acc;
    const key = decodeURIComponent(pair.slice(0, index));
    const value = decodeURIComponent(pair.slice(index + 1));
    acc[key] = value;
    return acc;
  }, {});

  const hash = params.hash;
  if (!hash) return { ok: false, reason: "no_hash" };
  delete params.hash;

  const dataCheckString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("\n");

  const secretKey = Utilities.computeHmacSha256Signature(botToken, "WebAppData");
  const signature = Utilities.computeHmacSha256Signature(dataCheckString, secretKey);
  const calculatedHash = signature
    .map((byte) => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0"))
    .join("");

  return {
    ok: calculatedHash === hash,
    reason: calculatedHash === hash ? "ok" : "bad_hash",
  };
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

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
];
const GAME_TYPES = ["pac", "invaders", "breakout"];
const GAME_LABELS = {
  pac: "PAC SALE",
  invaders: "CODE INVADERS",
  breakout: "PROMO BREAKOUT",
};

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
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
    return handleRatingGet_(spreadsheetId, e);
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function handleRatingGet_(spreadsheetId, e) {
  const limit = Math.min(Math.max(Number(e?.parameter?.limit) || 10, 1), 50);
  const sheet = getRatingSheet_(spreadsheetId);
  const rows = sheet.getDataRange().getValues().slice(1);
  const players = rows
    .map((row) => ({
      key: String(row[0] || ""),
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

function handleRatingEvent_(spreadsheetId, payload, verified, tokenConfigured) {
  const event = payload.event || "";
  if (event !== "rating_result" && event !== "instagram_share_intent") return;
  // With BOT_TOKEN configured, only Telegram-signed events may enter the public rating.
  if (tokenConfigured && !verified) return;
  const key = playerKey_(payload);
  if (!key) return;

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
  };
}

function ratingRecordFromRow_(row) {
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
  };
}

function applyPayloadToRecord_(record, payload) {
  record.name = playerName_(payload, record.name);
  record.userId = String(payload.telegram_user_id || record.userId || "");
  record.username = String(payload.telegram_username || record.username || "");
  record.chance = Math.max(record.chance, Number(payload.chance_multiplier) || 1);

  if (payload.event !== "rating_result") return;
  const gameType = String(payload.game_type || "");
  if (GAME_TYPES.indexOf(gameType) === -1) return;
  const rating = Number(payload.game_rating) || 0;
  const seconds = Number(payload.result_seconds) || 0;
  const best = record.games[gameType];
  const isBetter = rating > best.rating || (rating === best.rating && rating > 0 && seconds < best.seconds);
  if (isBetter) {
    record.games[gameType] = { rating, seconds };
  }
}

function ratingRowFromRecord_(record) {
  const playedGames = GAME_TYPES.filter((type) => record.games[type].rating > 0);
  const totalRating = playedGames.reduce((sum, type) => sum + record.games[type].rating, 0);
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

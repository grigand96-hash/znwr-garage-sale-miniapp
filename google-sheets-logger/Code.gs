const SHEET_NAME = "events";

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
      payload.mode || "",
      payload.sound_enabled === true,
      payload.promo || "",
      payload.app_url || "",
      payload.user_agent || "",
    ];

    sheet.appendRow(row);
    return json_({ ok: true });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function getEventsSheet_(spreadsheetId) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
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
      "mode",
      "sound_enabled",
      "promo",
      "app_url",
      "user_agent",
    ]);
    sheet.setFrozenRows(1);
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

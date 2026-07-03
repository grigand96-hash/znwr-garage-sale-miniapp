# Google Sheets Logger

Use this Apps Script as a tiny backend for ZNWR Garage Sale analytics.

## Setup

1. Create a Google Sheet.
2. Copy the spreadsheet ID from its URL.
3. Open https://script.google.com/ and create a new project.
4. Paste `Code.gs`.
5. In Apps Script, open `Project Settings` -> `Script properties` and add:
   - `SPREADSHEET_ID`: your Google Sheet ID.
   - `BOT_TOKEN`: Telegram bot token from BotFather. Optional for testing, recommended for launch.
6. Deploy -> New deployment -> Web app:
   - Execute as: `Me`
   - Who has access: `Anyone`
7. Copy the Web app URL.
8. Paste it into `analyticsEndpoint` in `app.js`.

## Logged Events

- `game_start`
- `game_over`
- `promo_unlocked`
- `promo_copied`
- `sound_on`
- `sound_off`

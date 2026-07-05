# ZNWR Garage Sale Mini App

Telegram WebApp prototype for an 80s arcade-style Garage + Sample Sale game.

## Public URL

https://grigand96-hash.github.io/znwr-garage-sale-miniapp/

## Local Preview

Open `index.html` directly or serve the folder:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Telegram

Host the folder on HTTPS and set the URL as a Telegram bot WebApp button.
The app already calls `Telegram.WebApp.ready()`, `expand()`, header/background
color methods, and uses haptic feedback when available.

## Analytics

Google Sheets logging is prepared in `google-sheets-logger/`.
Deploy that Apps Script as a Web App, then paste the Web App URL into
`analyticsEndpoint` in `app.js`.

The app logs game starts, rating results, sale-info opens, site clicks, and
Instagram share intents. The public ranking is based on the sum of each
player's best result across the three games, with game coefficients and a
speed bonus.

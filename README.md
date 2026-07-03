# ZNWR Garage Sale Mini App

Telegram WebApp prototype for an 80s arcade-style garage sale promo maze.

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

Promo codes are defined in `app.js` in the `promoCodes` array. The current
prototype unlocks a promo after 24 maze dots and stores a won promo in
`localStorage`; for production, promo issuance should be moved to a backend
endpoint tied to Telegram user identity.

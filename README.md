# App Proxy (Shopify App Proxy → Azure Function)

This is a minimal Node/Express backend used with **Shopify App Proxy** so the storefront can call:

`POST /apps/backorder`

without exposing the Azure Function key in theme code.

## Architecture

Shopify Theme JS (public)
→ `POST /apps/backorder` (Shopify App Proxy)
→ `POST https://YOUR_BACKEND_DOMAIN/backorder` (this server)
→ Azure Function (secret key stored in env var)

## Setup

### 1) Install

```bash
npm install
```

### 2) Configure env

Copy `.env.example` to `.env` and set `AZURE_BACKORDER_ENDPOINT` to your Azure Function URL INCLUDING `?code=...`.

```bash
cp .env.example .env
```

### 3) Run locally

```bash
npm run dev
```

Health check:

- GET `http://localhost:3000/health`

Proxy endpoint:

- POST `http://localhost:3000/backorder`

Example request:

```bash
curl -X POST http://localhost:3000/backorder \
  -H "Content-Type: application/json" \
  -d '{"variantId":"123","email":"test@example.com","qty":1}'
```

## Shopify App Proxy settings

In Shopify Admin → Settings → Apps and sales channels → Develop apps → Your app → App proxy:

- Subpath prefix: `apps`
- Subpath: `backorder`
- Proxy URL: `https://YOUR_BACKEND_DOMAIN/backorder`

Then your theme should call:

```js
fetch("/apps/backorder", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ variantId, ... })
})
```

## Deploy (Render quick start)

- Create a new Web Service from this repo
- Build command: `npm install`
- Start command: `npm start`
- Add env var:
  - `AZURE_BACKORDER_ENDPOINT=...`

## Notes

- Rotate the Azure Function key (it was previously exposed).
- Add HMAC verification later if you want to ensure requests are only coming from Shopify App Proxy.

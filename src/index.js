import express from "express"
import fetch from "node-fetch"
import dotenv from "dotenv"
import helmet from "helmet"
import morgan from "morgan"
import crypto from "crypto"

dotenv.config()

const app = express()

// Security / ops
app.use(helmet())
app.use(morgan("combined"))

// parse JSON bodies..
app.use(express.json({ limit: "256kb" }))

// Health check
app.get("/health", (_req, res) => res.status(200).send({ ok: true }))
// For Shopify App Proxy to check if the backend is alive
app.get("/backorder", (_req, res) => {
  res.status(200).send("Backorder proxy OK. Use POST /backorder.")
})

/**
 * Verify Shopify App Proxy request signature.
 *
 * Shopify app proxy signs requests via query parameters.
 * We'll validate using the app's "Client secret" (SHOPIFY_API_SECRET).
 *
 * Works for requests coming through:
 *   https://<store>.myshopify.com/apps/backorder?...signature=...
 *
 * Note: Shopify may provide either "signature" (legacy) or "hmac".
 * lets support both.
 */
function verifyShopifyAppProxy(req) {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret)
    return { ok: false, reason: "Missing SHOPIFY_API_SECRET env var" }

  // Shopify App Proxy uses `signature` (hex HMAC-SHA256)
  const { signature } = req.query
  if (!signature) return { ok: false, reason: "Missing signature query param" }

  // Build "key=value" strings for all params except signature
  const kvPairs = Object.keys(req.query)
    .filter((k) => k !== "signature")
    .map((k) => {
      const v = req.query[k]

      // repeated params become arrays -> join with comma
      const value = Array.isArray(v) ? v.join(",") : v ?? ""
      return `${k}=${value}`
    })
    // IMPORTANT: Shopify sorts the *strings*, not just the keys
    .sort()
    // IMPORTANT: Shopify concatenates with NO delimiter
    .join("")

  const calculated = crypto
    .createHmac("sha256", secret)
    .update(kvPairs)
    .digest("hex")

  const a = Buffer.from(calculated, "utf8")
  const b = Buffer.from(String(signature), "utf8")

  if (a.length !== b.length)
    return { ok: false, reason: "Signature length mismatch" }

  return crypto.timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: "Invalid signature" }
}


// for shopify app proxy to call
app.post("/backorder", async (req, res) => {
  // 1) Verify request came via Shopify App Proxy
  const verification = verifyShopifyAppProxy(req)
  if (!verification.ok) {
    return res
      .status(403)
      .send({ ok: false, error: `Forbidden: ${verification.reason}` })
  }

  try {
    const azureEndpoint = process.env.AZURE_ENDPOINT // keep current env var name
    if (!azureEndpoint) {
      return res
        .status(500)
        .send({ ok: false, error: "Missing AZURE_ENDPOINT env var" })
    }

    const payload = req.body || {}

    const variantId = payload.variantId || payload.variant_id
    if (!variantId) {
      return res.status(400).send({ ok: false, error: "variantId is required" })
    }

    const r = await fetch(azureEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })

    const text = await r.text()

    if (!r.ok) {
      return res.status(502).send({
        ok: false,
        error: "Azure Function call failed",
        status: r.status,
        body: text
      })
    }

    return res.status(200).send({ ok: true })
  } catch (e) {
    return res.status(500).send({ ok: false, error: e?.message || String(e) })
  }
})

const port = Number(process.env.PORT || 3000)
app.listen(port, () => {
  console.log(`Backorder proxy listening on http://localhost:${port}`)
})

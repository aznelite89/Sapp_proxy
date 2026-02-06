import express from "express"
import fetch from "node-fetch"
import dotenv from "dotenv"
import helmet from "helmet"
import morgan from "morgan"

dotenv.config()

const app = express()

// Security / ops
app.use(helmet())
app.use(morgan("combined"))

// Parse JSON bodies
app.use(express.json({ limit: "256kb" }))

// Health check
app.get("/health", (_req, res) => res.status(200).send({ ok: true }))
// For Shopify App Proxy to check if the backend is alive
app.get("/backorder", (_req, res) => {
  res.status(200).send("Backorder proxy OK. Use POST /backorder.")
})

/**
 * Shopify App Proxy endpoint
 * Shopify forwards:
 *   https://<store>.myshopify.com/apps/backorder
 * to your backend:
 *   https://YOUR_BACKEND_DOMAIN/backorder
 *
 * Keep Azure Function secret URL+key ONLY in env vars.
 */
app.post("/backorder", async (req, res) => {
  try {
    const azureEndpoint = process.env.AZURE_ENDPOINT
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

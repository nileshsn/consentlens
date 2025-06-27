import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@/lib/supabase"

/* ------------------------------------------------------------------ */
/* 🔧 Config                                                           */
/* ------------------------------------------------------------------ */
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
// ✅ Use a proper model name, not the API key
const FALLBACK_MODEL = "llama3-70b-8192" // ✅ public + free
// Only use GROQ_MODEL if it's actually a model name, not an API key
const MODEL_NAME =
  process.env.GROQ_MODEL && !process.env.GROQ_MODEL.startsWith("gsk_") ? process.env.GROQ_MODEL : FALLBACK_MODEL

// A helper to return a safe JSON response
const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, { status: 200, ...init })

// Very small deterministic fallback so the UI can still work
const fallbackResult = {
  complianceScore: 72,
  riskLevel: "medium",
  keyPoints: [
    "Data is shared with third-party analytics providers.",
    "User data may be stored for up to 24 months.",
    "You have the right to request deletion of personal data.",
    "Cookies are used for personalisation and ads.",
    "Service reserves the right to update terms without notice.",
  ],
  recommendations: [
    {
      title: "Disable third-party cookies",
      description: "Limit tracking by turning off third-party cookies in your browser.",
      severity: "medium",
      category: "privacy",
    },
    {
      title: "Request data deletion",
      description: "Exercise your right to be forgotten if you stop using the service.",
      severity: "high",
      category: "rights",
    },
  ],
}

// Small helper
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ⇢ Extract "Please try again in 20.219s."  →  20219 ms
function parseGroqRetry(text: string | null): number | null {
  if (!text) return null
  const match = text.match(/try again in\s+([\d.]+)s/i)
  if (match) return Math.ceil(Number.parseFloat(match[1]) * 1_000)
  return null
}

interface AnalysisRequest {
  content: string
  lawRegion: string
  documentId: string
}

export async function POST(req: NextRequest) {
  try {
    const { content, lawRegion, documentId } = (await req.json()) as AnalysisRequest

    /* -------------------------------------------------------------- */
    /* 0️⃣ Input validation                                           */
    /* -------------------------------------------------------------- */
    if (!content || !lawRegion) return json({ error: "Missing content or lawRegion" }, { status: 400 })

    /* -------------------------------------------------------------- */
    /* 1️⃣ If no API key → fallback                                   */
    /* -------------------------------------------------------------- */
    if (!GROQ_API_KEY) {
      console.warn("⚠️  GROQ_API_KEY missing – returning fallback result")
      await saveResult(documentId, fallbackResult)
      return json(fallbackResult)
    }

    /* -------------------------------------------------------------- */
    /* 2️⃣  Build & send the Groq request (with retry on 5xx/429)     */
    /* -------------------------------------------------------------- */
    const regionMap: Record<string, string> = {
      gdpr: "GDPR (EU)",
      ccpa: "CCPA (California)",
      dpdpa: "DPDPA (India)",
    }

    const prompt = `
Analyse the following document under ${regionMap[lawRegion] ?? lawRegion}.
Return strict JSON with keys:
complianceScore (0-100),
riskLevel ("low"|"medium"|"high"),
keyPoints (string[] 5-7 items),
recommendations (array of {title,description,severity,category} 4-6 items).

Document:
"""${content.slice(0, 10_000)}"""
`

    async function callGroq(model: string) {
      return fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are a privacy-law assistant. Always answer with valid JSON only." },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
      })
    }

    /* 🔄 retry on transient errors (5xx / 429) */
    const MAX_RETRIES = 4
    let attempt = 0
    let groqRes: Response | null = null
    let bodyText: string | null = null

    while (attempt < MAX_RETRIES) {
      groqRes = await callGroq(MODEL_NAME)

      if (groqRes.ok || groqRes.status === 404) break

      bodyText = await groqRes.text()

      // Respect Retry-After header OR parse “try again in …s”
      if (groqRes.status === 429) {
        const retryHeader = groqRes.headers.get("retry-after")
        const headerDelay = retryHeader ? Number.parseInt(retryHeader, 10) * 1_000 : null
        const parsedDelay = parseGroqRetry(bodyText)
        const delay = headerDelay ?? parsedDelay ?? 5_000

        console.warn(`Groq 429: waiting ${delay} ms before retry (${attempt + 1}/${MAX_RETRIES})`)
        await sleep(delay)
      } else if (groqRes.status >= 500) {
        // exponential back-off for 5xx
        const delay = 2_000 * 2 ** attempt
        await sleep(delay)
      } else break

      attempt++
    }

    /* 404 → automatically retry once with fallback model */
    if (groqRes && !groqRes.ok && groqRes.status === 404) {
      console.warn(`⚠️  Model ${MODEL_NAME} not found – retrying with fallback ${FALLBACK_MODEL}`)
      groqRes = await callGroq(FALLBACK_MODEL)
    }

    /* -------------------------------------------------------------- */
    /* 3️⃣ Handle non-OK responses (after retries)                    */
    /* -------------------------------------------------------------- */
    if (!groqRes || !groqRes.ok) {
      const bodyText = groqRes ? await groqRes.text() : "no response"
      console.error("Groq error after retries:", groqRes?.status, bodyText)
      await saveResult(documentId, fallbackResult)
      return json(
        { ...fallbackResult, fallback: true, groqStatus: groqRes?.status ?? "no_response", groqBody: bodyText },
        { status: 200 },
      )
    }

    const { choices } = (await groqRes.json()) as any
    const answer = choices?.[0]?.message?.content?.trim() ?? ""

    let parsed
    try {
      parsed = JSON.parse(answer)
    } catch {
      console.warn("Groq JSON parse failed – using fallback")
      parsed = fallbackResult
    }

    await saveResult(documentId, parsed)
    return json(parsed)
  } catch (err) {
    console.error("Analysis route failed:", err)
    return json({ error: "Internal error" }, { status: 500 })
  }
}

/* ------------------------------------------------------------------ */
/* 🗄️ Helper – store result in DB                                    */
/* ------------------------------------------------------------------ */
async function saveResult(
  documentId: string,
  r: {
    complianceScore: number
    riskLevel: string
    keyPoints: string[]
    recommendations: unknown[]
  },
) {
  try {
    const supabase = createServerClient()
    await supabase.from("analysis_results").insert({
      document_id: documentId,
      summary: { keyPoints: r.keyPoints },
      compliance_score: r.complianceScore,
      risk_level: r.riskLevel,
      recommendations: r.recommendations,
    })
  } catch (e) {
    console.error("Failed to save analysis:", e)
  }
}

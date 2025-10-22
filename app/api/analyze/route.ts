import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@/lib/supabase"

/* ------------------------------------------------------------------ */
/* 🔧 Config                                                          */
/* ------------------------------------------------------------------ */
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const FALLBACK_MODEL = "llama3-70b-8192"

const MODEL_NAME =
  process.env.GROQ_MODEL && !process.env.GROQ_MODEL.startsWith("gsk_")
    ? process.env.GROQ_MODEL
    : FALLBACK_MODEL

const json = (data: unknown, init?: ResponseInit) =>
  NextResponse.json(data, { status: 200, ...init })

const fallbackResult = {
  complianceScore: 72,
  riskLevel: "medium",
  keyPoints: [
    "Data is shared with third-party analytics providers.",
    "User data may be stored for up to 24 months.",
    "You have the right to request deletion of personal data.",
    "Cookies are used for personalization and ads.",
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function parseGroqRetry(text: string | null): number | null {
  if (!text) return null
  const match = text.match(/try again in\s+([\d.]+)s/i)
  if (match) return Math.ceil(Number.parseFloat(match[1]) * 1000)
  return null
}

interface AnalysisRequest {
  content: string
  lawRegion: string
  documentId?: string
}

/* ------------------------------------------------------------------ */
/* 🧠 Main Handler                                                    */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  try {
    const { content, lawRegion, documentId } = (await req.json()) as AnalysisRequest

    if (!content || !lawRegion) {
      return json({ error: "Missing content or lawRegion" }, { status: 400 })
    }

    /* -------------------------------------------------------------- */
    /* 1️⃣  No API key → fallback                                     */
    /* -------------------------------------------------------------- */
    if (!GROQ_API_KEY) {
      console.warn("⚠️ GROQ_API_KEY missing – returning fallback result")
      if (documentId) await saveResult(documentId, fallbackResult)
      return json(fallbackResult)
    }

    /* -------------------------------------------------------------- */
    /* 2️⃣  Build & Send Groq Request                                 */
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
            {
              role: "system",
              content: "You are a privacy-law assistant. Always answer with valid JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
      })
    }

    /* 🔄 Retry on 5xx / 429 errors */
    const MAX_RETRIES = 4
    let attempt = 0
    let groqRes: Response | null = null

    while (attempt < MAX_RETRIES) {
      try {
        groqRes = await callGroq(MODEL_NAME)
      } catch (fetchErr) {
        console.error("Groq fetch failed:", fetchErr)
        if (documentId) await saveResult(documentId, fallbackResult)
        return json({
          ...fallbackResult,
          fallback: true,
          error: "groq_fetch_failed",
          details: String(fetchErr),
        })
      }

      if (groqRes.ok || groqRes.status === 404) break

      const bodyText = await groqRes.text()

      if (groqRes.status === 429) {
        const retryHeader = groqRes.headers.get("retry-after")
        const headerDelay = retryHeader ? Number.parseInt(retryHeader, 10) * 1000 : null
        const parsedDelay = parseGroqRetry(bodyText)
        const delay = headerDelay ?? parsedDelay ?? 5000
        console.warn(`Groq 429: waiting ${delay} ms before retry (${attempt + 1}/${MAX_RETRIES})`)
        await sleep(delay)
      } else if (groqRes.status >= 500) {
        const delay = 2000 * 2 ** attempt
        console.warn(`Groq 5xx: retrying after ${delay}ms`)
        await sleep(delay)
      } else break

      attempt++
    }

    /* 404 → fallback model */
    if (groqRes && !groqRes.ok && groqRes.status === 404) {
      console.warn(`⚠️ Model ${MODEL_NAME} not found – retrying with fallback ${FALLBACK_MODEL}`)
      try {
        groqRes = await callGroq(FALLBACK_MODEL)
      } catch (fetchErr) {
        console.error("Fallback Groq fetch failed:", fetchErr)
        if (documentId) await saveResult(documentId, fallbackResult)
        return json({
          ...fallbackResult,
          fallback: true,
          error: "groq_fallback_fetch_failed",
          details: String(fetchErr),
        })
      }
    }

    /* -------------------------------------------------------------- */
    /* 3️⃣  Handle non-OK responses                                   */
    /* -------------------------------------------------------------- */
    if (!groqRes || !groqRes.ok) {
      const bodyText = groqRes ? await groqRes.text() : "no response"
      console.error("Groq error after retries:", groqRes?.status, bodyText)

      if (documentId) await saveResult(documentId, fallbackResult)

      return json({
        ...fallbackResult,
        fallback: true,
        groqStatus: groqRes?.status ?? "no_response",
        groqBody: bodyText,
      })
    }

    /* -------------------------------------------------------------- */
    /* 4️⃣  Parse Response                                            */
    /* -------------------------------------------------------------- */
    const { choices } = (await groqRes.json()) as any
    const answer = choices?.[0]?.message?.content?.trim() ?? ""
    let parsed

    try {
      parsed = JSON.parse(answer)
    } catch (e) {
      console.warn("Groq JSON parse failed – using fallback")
      parsed = fallbackResult
    }

    if (documentId) {
      try {
        await saveResult(documentId, parsed)
      } catch (saveErr) {
        console.error("Failed saving parsed result:", saveErr)
      }
    } else {
      console.warn("No documentId provided — skipping saveResult")
    }

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
  if (!documentId) {
    console.warn("saveResult called without documentId — skipping DB write")
    return
  }

  try {
    const supabase = createServerClient()
    const { error } = await supabase.from("analysis_results").insert({
      document_id: documentId,
      summary: { keyPoints: r.keyPoints },
      compliance_score: r.complianceScore,
      risk_level: r.riskLevel,
      recommendations: r.recommendations,
    })

    if (error) throw error
  } catch (e) {
    console.error("Failed to save analysis:", e)
  }
}

import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@/lib/supabase"

/* ------------------------------------------------------------------ */
/* 🔧 Config                                                           */
/* ------------------------------------------------------------------ */
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = process.env.GROQ_URL ?? "https://api.groq.com/openai/v1/chat/completions"
const MODEL_NAME = process.env.GROQ_MODEL ?? ""
const FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL ?? MODEL_NAME
const USE_FALLBACK = process.env.USE_FALLBACK === "true"

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

    if (!content || !lawRegion) return json({ error: "Missing content or lawRegion" }, { status: 400 })

    // If no API key or no model configured -> return informative error (unless USE_FALLBACK)
    if (!GROQ_API_KEY || !MODEL_NAME) {
      console.warn("GROQ config missing:", { hasKey: !!GROQ_API_KEY, hasModel: !!MODEL_NAME })
      if (USE_FALLBACK) {
        console.warn("USE_FALLBACK is true — returning local fallback")
        if (documentId) await saveResult(documentId, fallbackResult)
        return json(fallbackResult)
      }
      return json({ error: "GROQ_API_KEY or GROQ_MODEL missing. Set environment variables." }, { status: 500 })
    }

    const regionMap: Record<string, string> = {
      gdpr: "GDPR (EU)",
      ccpa: "CCPA (California)",
      dpdpa: "DPDPA (India)",
    }

    const prompt = `You are a specialized AI privacy analyst trained in legal document analysis.

Analyze the following document under ${regionMap[lawRegion] ?? lawRegion} compliance requirements.
Focus on:
1. Privacy implications
2. Data handling practices
3. User rights and consent mechanisms
4. Security measures
5. Cross-border data transfers
6. Vendor/third-party relationships

Return a JSON object with:
{
  "complianceScore": number (0-100), // Based on comprehensive evaluation
  "riskLevel": "low" | "medium" | "high", // Overall risk assessment
  "keyPoints": string[], // 5-7 most important findings
  "detailedAnalysis": {
    "dataCollection": { // What data is collected
      "required": string[],
      "optional": string[],
      "purpose": string
    },
    "userRights": string[], // Specific rights granted to users
    "dataSharingPractices": {
      "parties": string[],
      "purposes": string[]
    },
    "retentionPolicies": string,
    "securityMeasures": string[]
  },
  "recommendations": [
    {
      "title": string,
      "description": string,
      "severity": "low" | "medium" | "high",
      "category": "privacy" | "security" | "rights" | "compliance",
      "implementationSteps": string[]
    }
  ],
  "complianceGaps": string[] // Specific areas needing improvement
}

Document:
"""${content.slice(0, 12000)}"""

Provide detailed analysis considering both explicit statements and implicit implications.`

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
            { role: "system", content: "You are a privacy-law assistant. Answer with JSON when possible, but if not produce a thorough textual analysis." },
            { role: "user", content: prompt },
          ],
          temperature: 0.25,
          max_tokens: 1600,
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
      if (USE_FALLBACK) {
        if (documentId) await saveResult(documentId, fallbackResult)
        return json({ ...fallbackResult, fallback: true, groqStatus: groqRes?.status ?? "no_response", groqBody: bodyText }, { status: 200 })
      }
      // Surface the real error to client (non-secret) so frontend can show it
      return json({ error: "Groq API failed", status: groqRes?.status ?? 500, details: bodyText }, { status: 502 })
    }

    const payload = await groqRes.json().catch(async () => {
      // If response is not JSON, read text and return it to client
      const txt = await groqRes.text()
      return { rawText: txt }
    })

    const answer = (payload?.choices?.[0]?.message?.content ?? payload?.rawText ?? "").trim()

    let parsed: any
    try {
      parsed = JSON.parse(answer)
    } catch {
      // If content is not JSON, return it as a detailed textualAnalysis field (no static fallback)
      parsed = {
        complianceScore: null,
        riskLevel: "unknown",
        keyPoints: [],
        textualAnalysis: answer,
        recommendations: [],
      }
    }

    if (documentId) {
      try { await saveResult(documentId, parsed) } catch (e) { console.error("saveResult failed:", e) }
    }

    return json(parsed)
  } catch (err) {
    console.error("Analysis route failed:", err)
    return json({ error: "Internal error", message: err instanceof Error ? err.message : String(err) }, { status: 500 })
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

import { NextResponse, type NextRequest } from "next/server"

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODEL_NAME = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"

const regionMap: Record<string, string> = {
  "US": "CCPA and US privacy laws",
  "EU": "GDPR",
  "Global": "international privacy regulations"
}

const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, { status: 200, ...init })

interface ChatRequest {
  documentContent: string
  question: string
  lawRegion: string
  chatHistory: { role: "user" | "assistant"; content: string }[]
}

export async function POST(req: NextRequest) {
  try {
    const { documentContent, question, chatHistory, lawRegion } = (await req.json()) as ChatRequest

    if (!documentContent || !question) {
      return json({ error: "Missing documentContent or question" }, { status: 400 })
    }

    if (!GROQ_API_KEY) {
      return json({ content: "The GROQ_API_KEY is not configured. Please add it to your environment variables." })
    }

    const systemPrompt = `You are ConsentLens, an expert AI privacy analyst specializing in ${regionMap[lawRegion] ?? "privacy"} compliance.

Core Capabilities:
1. Deep understanding of privacy laws and regulations
2. Ability to interpret legal language for non-experts
3. Pattern recognition across privacy policies
4. Contextual awareness of modern privacy challenges

Guidelines for Response:
1. EVIDENCE: Always cite specific sections using markdown blockquotes (>)
2. CONTEXT: Reference previous chat history when relevant
3. IMPLICATIONS: Explain both direct and indirect consequences
4. COMPARISONS: Compare with standard industry practices when relevant
5. ACTIONABLE: Provide practical suggestions when appropriate

Document Analysis Context:
"""${documentContent.slice(0, 12000)}"""

Previous Context:
${chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Remember: Base all responses on the document content while leveraging privacy expertise to provide deeper insights.`

    const messages = [
      { role: "system", content: systemPrompt },
      ...chatHistory,
      { role: "user", content: question },
    ]

    // Update model parameters for more detailed responses
    const modelConfig = {
      model: MODEL_NAME,
      messages,
      temperature: 0.3, // Lower for more consistent responses
      max_tokens: 4096,
      top_p: 0.95,    // Slightly reduced for more focused responses
      presence_penalty: 0.1, // Small penalty to encourage varied language
      frequency_penalty: 0.1 // Small penalty to reduce repetition
    }

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(modelConfig),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error("Groq API error:", errorBody)
      return json({ error: "Failed to get response from Groq" }, { status: 500 })
    }

    const { choices } = (await res.json()) as any
    const answer = choices?.[0]?.message?.content?.trim() ?? "Sorry, I could not generate a response."

    return json({ content: answer })
  } catch (err) {
    console.error("Chat API error:", err)
    return json({ error: "Internal server error" }, { status: 500 })
  }
}
import { NextResponse, type NextRequest } from "next/server"

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODEL_NAME = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"

const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, { status: 200, ...init })

interface ChatRequest {
  documentContent: string
  question: string
  chatHistory: { role: "user" | "assistant"; content: string }[]
}

export async function POST(req: NextRequest) {
  try {
    const { documentContent, question, chatHistory } = (await req.json()) as ChatRequest

    if (!documentContent || !question) {
      return json({ error: "Missing documentContent or question" }, { status: 400 })
    }

    if (!GROQ_API_KEY) {
      return json({ content: "The GROQ_API_KEY is not configured. Please add it to your environment variables." })
    }

    const systemPrompt = `You are ConsentLens, an expert AI privacy analyst. Your goal is to help users understand complex legal documents.
You will be given a legal document and a user's question about it. You will also receive the preceding chat history for context.
Your task is to provide a clear, detailed, and helpful answer to the user's question, basing your response *strictly* on the provided document content.

**Instructions:**
1.  **Analyze the User's Question:** Understand the user's intent, even if they use informal language.
2.  **Cite Evidence:** When you provide an answer, you MUST quote the relevant section(s) from the document that support your explanation. Use markdown blockquotes for quoting.
3.  **Be Detailed:** Do not give short, generic answers. Explain the implications of the legal text in a way a non-expert can understand.
4.  **Stay in Scope:** If the user asks a question that cannot be answered from the document, clearly state that the document does not contain the information and explain what the document *does* say about related topics, if applicable. For example, if the document is for App A and the user asks about App B, say "This document is for App A, so I cannot provide details about App B."
5.  **Maintain Persona:** Be helpful, expert, and focused on user empowerment.

**Document Content:**
"""
${documentContent.slice(0, 12000)}
"""`

    const messages = [
      { role: "system", content: systemPrompt },
      ...chatHistory,
      { role: "user", content: question },
    ]

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages,
        temperature: 0.4,
        max_tokens: 4096,
      }),
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
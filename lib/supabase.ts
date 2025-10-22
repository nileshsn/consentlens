// supabaseClient.js
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// ✅ Validate environment variables
if (!supabaseUrl) {
  throw new Error(
    "❌ Missing environment variable: NEXT_PUBLIC_SUPABASE_URL. Please add it to your .env.local file.",
  )
}

if (!supabaseAnonKey) {
  throw new Error(
    "❌ Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY. Please add it to your .env.local file.",
  )
}

// ✅ Create a reusable client-side Supabase instance
export const supabase: SupabaseClient = createClient(supabaseUrl as string, supabaseAnonKey as string, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// ✅ Create a server-side Supabase client (with optional service role key)
export function createServerClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    // Warning only, since not all server routes require it
    console.warn(
      "⚠️ Missing environment variable: SUPABASE_SERVICE_ROLE_KEY. " +
        "Server-side functions requiring admin rights will fail.",
    )
  }

  return createClient(supabaseUrl as string, (serviceRoleKey || supabaseAnonKey) as string, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

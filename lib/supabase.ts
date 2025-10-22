import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error("❌ Missing environment variable: NEXT_PUBLIC_SUPABASE_URL. Please add it to your .env.local file.")
}

if (!supabaseAnonKey) {
  throw new Error("❌ Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY. Please add it to your .env.local file.")
}

// Create a single instance that will be reused
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

export const supabase = supabaseClient

// Server-side client - only create when needed
export const createServerClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    // This should only be a warning, as the service role key is not always needed for the app to run
    console.warn("⚠️  Missing environment variable: SUPABASE_SERVICE_ROLE_KEY. Server-side functions requiring admin rights will fail.")
  }

  return createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

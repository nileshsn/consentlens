import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const { userId } = await request.json()
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Delete analysis_results for user's documents
  const { data: docs } = await supabase.from('documents').select('id').eq('user_id', userId)
  const docIds = docs?.map((d: any) => d.id) ?? []
  if (docIds.length > 0) {
    await supabase.from('analysis_results').delete().in('document_id', docIds)
  }
  // Delete documents
  await supabase.from('documents').delete().eq('user_id', userId)
  // Delete user_profiles
  await supabase.from('user_profiles').delete().eq('id', userId)
  // Delete user from auth (admin)
  const { error: adminError } = await supabase.auth.admin.deleteUser(userId)
  if (adminError) {
    return NextResponse.json({ error: adminError.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
} 
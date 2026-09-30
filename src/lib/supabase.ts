import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } },
})

type PreviewRpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>

/** Calls a Postgres RPC and turns Supabase errors into thrown Errors with the Polish message from SQL. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  // the dev preview route answers a few calls itself, so the dialogs can be walked through without a backend
  const fake = import.meta.env.DEV ? (window as unknown as { __previewRpc?: PreviewRpc }).__previewRpc : undefined
  if (fake) return (await fake(fn, args)) as T
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(cleanMessage(error.message))
  return data as T
}

function cleanMessage(msg: string): string {
  // Postgres wraps RAISE text; strip common prefixes.
  return msg.replace(/^(ERROR:|error:)\s*/i, '').trim()
}

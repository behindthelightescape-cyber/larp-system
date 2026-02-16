import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cqbiozfappfwfcahtxfm.supabase.co'
const supabaseKey = 'sb_publishable_usai8S5HF6AGB61bCsrRJQ_R7HjUFUV' // ⚠️ 用 Anon Key (公開的那把)

export const supabase = createClient(supabaseUrl, supabaseKey)
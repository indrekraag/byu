import { createClient } from '@supabase/supabase-js';

// Public by design: access is enforced by row-level security and a crew login
// (sign-ups disabled), never by hiding this key.
export const SUPABASE_URL = 'https://dnqbwlwvjohrxhssoedn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_p_TvLLYVXCcwX2UvHFInNA_kdlEVqBi';

export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'byu-dash:auth' },
});

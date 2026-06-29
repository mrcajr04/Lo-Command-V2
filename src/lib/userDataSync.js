import { supabase } from './supabase.js';

async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function syncFromCloud(keys) {
  const userId = await getUserId();
  if (!userId) return;

  const { data, error } = await supabase
    .from('user_data')
    .select('key, value')
    .eq('user_id', userId)
    .in('key', keys);

  if (error) { console.error('syncFromCloud error:', error); return; }

  for (const row of data) {
    localStorage.setItem(row.key, JSON.stringify(row.value));
  }
}

export async function syncToCloud(key, value) {
  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('user_data')
    .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });

  if (error) console.error('syncToCloud error:', error);
}

import { supabase } from './supabase.js';

async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export const SYNC_KEYS = [
  'lo_command_contacts',
  'lo_command_workspace_links',
  'lo_command_workspace_link_categories',
  'lo_command_workspace_profile',
  'lo_command_vault_preferences',
  'lo_command_sidebar_collapsed',
  'lo_command_vault',
];

export async function syncFromCloud() {
  const userId = await getUserId();
  if (!userId) return;

  const { data, error } = await supabase
    .from('user_data')
    .select('key, value')
    .eq('user_id', userId)
    .in('key', SYNC_KEYS);

  if (error) { console.error('syncFromCloud error:', error); return; }

  const foundKeys = new Set(data.map(r => r.key));

  for (const row of data) {
    if (row.key === 'lo_command_vault') {
      const v = row.value;
      if (v?.salt) localStorage.setItem('lo_command_vault_salt', v.salt);
      if (v?.iv) localStorage.setItem('lo_command_vault_iv', v.iv);
      if (v?.data) localStorage.setItem('lo_command_vault_data', v.data);
    } else {
      localStorage.setItem(row.key, JSON.stringify(row.value));
    }
  }

  // For new users with no cloud data, write empty arrays so the app
  // doesn't seed them with the default sample contacts and links.
  const pristineDefaults = {
    'lo_command_contacts': [],
    'lo_command_workspace_links': [],
    'lo_command_workspace_link_categories': [],
  };
  for (const [key, empty] of Object.entries(pristineDefaults)) {
    if (!foundKeys.has(key)) {
      localStorage.setItem(key, JSON.stringify(empty));
    }
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

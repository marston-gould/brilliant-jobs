// supabase/functions/admin-audit-log/index.ts
// SPEC-ADMIN-002-S2: Audit Log Viewer — paginated, filterable, export
// Read-only. No mutations permitted via this EF.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const sb = createClient(SB_URL, SB_KEY);

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile } = await sb.from('profiles').select('id, role').eq('id', user.id).single();
  if (!profile || !['admin', 'superadmin'].includes(profile.role))
    return json({ error: 'Forbidden — admin required' }, 403);

  try {
    const body = await req.json();
    const {
      actor_id = '', action_filter = '', target_type = '',
      search = '', date_from = '', date_to = '',
      page = 1, per_page = 50,
    } = body;

    let q = sb.from('admin_audit_log').select(`
      id, action, target_type, target_id, before, after, reason,
      ip_address, created_at,
      profiles!actor_id(id, email, display_name)
    `, { count: 'exact' });

    if (actor_id) q = q.eq('actor_id', actor_id);
    if (action_filter) q = q.ilike('action', `%${action_filter}%`);
    if (target_type) q = q.eq('target_type', target_type);
    if (search) q = q.or(`action.ilike.%${search}%,reason.ilike.%${search}%`);
    if (date_from) q = q.gte('created_at', date_from);
    if (date_to) q = q.lte('created_at', date_to);

    q = q.order('created_at', { ascending: false })
         .range((page - 1) * per_page, page * per_page - 1);

    const { data, count, error } = await q;
    if (error) throw error;

    return json({ entries: data ?? [], total: count ?? 0, page, per_page });

  } catch (err) {
    console.error('[admin-audit-log]', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

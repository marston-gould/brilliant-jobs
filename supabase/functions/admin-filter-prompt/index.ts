// supabase/functions/admin-filter-prompt/index.ts
// SPEC-ADMIN-002-S2: Filter Config CRUD + Prompt Template CRUD
// All mutations write to admin_audit_log.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { withAnthropicBreaker } from '../_shared/anthropic.ts';

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

async function requireAdmin(sb: ReturnType<typeof createClient>, token: string) {
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await sb.from('profiles').select('id, role').eq('id', user.id).single();
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) return null;
  return { user, profile };
}

async function writeAudit(sb: ReturnType<typeof createClient>, params: {
  actor_id: string; action: string; target_type: string;
  target_id?: string; before?: unknown; after?: unknown;
}) {
  await sb.from('admin_audit_log').insert({
    actor_id: params.actor_id, action: params.action,
    target_type: params.target_type, target_id: params.target_id ?? null,
    before: params.before ?? null, after: params.after ?? null,
  });
}

// Extract {{variable}} placeholders from a template string
function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  return [...new Set([...matches].map(m => m[1]))];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const sb = createClient(SB_URL, SB_KEY);

  const admin = await requireAdmin(sb, token);
  if (!admin) return json({ error: 'Forbidden — admin required' }, 403);

  try {
    const body = await req.json();
    const { action } = body;

    // ── FILTER CONFIG ──────────────────────────────────────────────────────────
    if (action === 'list_filters') {
      const { include_inactive = false } = body;
      let q = sb.from('filter_config').select('*').order('sort_order');
      if (!include_inactive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return json({ filters: data ?? [] });
    }

    if (action === 'upsert_filter') {
      const { filter } = body;
      if (!filter?.key || !filter?.label) return json({ error: 'key and label required' }, 400);
      const VALID_TYPES = ['range', 'select', 'toggle', 'multi-select'];
      if (!VALID_TYPES.includes(filter.type)) return json({ error: 'invalid type' }, 400);

      const { data: existing } = await sb.from('filter_config').select('*').eq('key', filter.key).single();

      const payload = {
        key: filter.key, label: filter.label, type: filter.type,
        options: filter.options ?? null, default_value: filter.default_value ?? null,
        weight: filter.weight ?? 1.0, is_active: filter.is_active ?? true,
        sort_order: filter.sort_order ?? 0,
      };

      const { data, error } = await sb.from('filter_config')
        .upsert(payload, { onConflict: 'key' }).select().single();
      if (error) throw error;

      await writeAudit(sb, {
        actor_id: admin.profile.id,
        action: existing ? 'filter.update' : 'filter.create',
        target_type: 'filter', target_id: data!.id,
        before: existing ?? null, after: payload,
      });

      return json({ success: true, filter: data });
    }

    if (action === 'delete_filter') {
      const { filter_key } = body;
      if (!filter_key) return json({ error: 'filter_key required' }, 400);
      const { data: existing } = await sb.from('filter_config').select('*').eq('key', filter_key).single();
      if (!existing) return json({ error: 'Filter not found' }, 404);

      // Soft-delete via is_active=false
      await sb.from('filter_config').update({ is_active: false }).eq('key', filter_key);
      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'filter.deactivate',
        target_type: 'filter', target_id: existing.id,
        before: { is_active: true }, after: { is_active: false },
      });
      return json({ success: true });
    }

    // ── PROMPT TEMPLATES ───────────────────────────────────────────────────────
    if (action === 'list_prompts') {
      const { feature = '', include_inactive = false } = body;
      let q = sb.from('prompt_templates').select('id, name, feature, role, version, is_active, created_at, updated_at').order('feature').order('name');
      if (feature) q = q.eq('feature', feature);
      if (!include_inactive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return json({ prompts: data ?? [] });
    }

    if (action === 'get_prompt') {
      const { prompt_id } = body;
      if (!prompt_id) return json({ error: 'prompt_id required' }, 400);
      const { data, error } = await sb.from('prompt_templates').select('*').eq('id', prompt_id).single();
      if (error || !data) return json({ error: 'Prompt not found' }, 404);
      return json({ prompt: data, variables: extractVariables(data.template) });
    }

    if (action === 'save_prompt') {
      const { prompt } = body;
      if (!prompt?.name || !prompt?.feature || !prompt?.template) {
        return json({ error: 'name, feature, and template required' }, 400);
      }
      if (!['system', 'user', 'assistant'].includes(prompt.role ?? 'user')) {
        return json({ error: 'role must be system, user, or assistant' }, 400);
      }

      // Validate required variables if declared
      const foundVars = extractVariables(prompt.template);
      const requiredVars: string[] = prompt.required_variables ?? [];
      const missing = requiredVars.filter((v: string) => !foundVars.includes(v));
      if (missing.length > 0) {
        return json({ error: 'Missing required variables in template', missing_variables: missing }, 400);
      }

      // Check if name exists — if so, create new version
      const { data: existing } = await sb.from('prompt_templates').select('id, version').eq('name', prompt.name).single();

      const newVersion = existing ? (existing.version + 1) : 1;

      // Deactivate old version if updating
      if (existing) {
        await sb.from('prompt_templates').update({ is_active: false }).eq('name', prompt.name);
      }

      const payload = {
        name: prompt.name, feature: prompt.feature,
        role: prompt.role ?? 'user', template: prompt.template,
        model: prompt.model ?? null, max_tokens: prompt.max_tokens ?? null,
        temperature: prompt.temperature ?? null,
        version: newVersion, is_active: true,
        created_by: existing ? null : admin.profile.id,
        updated_by: admin.profile.id,
      };

      const { data, error } = await sb.from('prompt_templates').insert(payload).select().single();
      if (error) throw error;

      await writeAudit(sb, {
        actor_id: admin.profile.id,
        action: existing ? 'prompt.update' : 'prompt.create',
        target_type: 'prompt', target_id: data!.id,
        before: existing ? { version: existing.version } : null,
        after: { version: newVersion, name: prompt.name },
      });

      return json({ success: true, prompt: data, variables: foundVars });
    }

    if (action === 'restore_prompt_version') {
      const { prompt_id } = body;
      if (!prompt_id) return json({ error: 'prompt_id required' }, 400);
      const { data: target } = await sb.from('prompt_templates').select('*').eq('id', prompt_id).single();
      if (!target) return json({ error: 'Version not found' }, 404);

      // Deactivate all versions of this name, activate the requested one
      await sb.from('prompt_templates').update({ is_active: false }).eq('name', target.name);
      await sb.from('prompt_templates').update({ is_active: true }).eq('id', prompt_id);

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'prompt.restore_version',
        target_type: 'prompt', target_id: prompt_id,
        after: { version: target.version, name: target.name },
      });
      return json({ success: true, restored_version: target.version });
    }

    // ── PROMPT VERSION HISTORY ───────────────────────────────────────────────────
    if (action === 'prompt_version_history') {
      const { prompt_name } = body;
      if (!prompt_name) return json({ error: 'prompt_name required' }, 400);
      const { data, error } = await sb.from('prompt_templates')
        .select('id, version, is_active, created_at, updated_at, updated_by, template, model, max_tokens, temperature, profiles!updated_by(email)')
        .eq('name', prompt_name)
        .order('version', { ascending: false });
      if (error) throw error;
      return json({ versions: data ?? [] });
    }

    // ── PROMPT TEST RUNNER ────────────────────────────────────────────────────────
    // §7.2: Fire prompt against model with test variable values.
    // NEVER fires against production user data — all test vars supplied by admin.
    if (action === 'test_prompt') {
      const { prompt_id, test_variables } = body;
      if (!prompt_id) return json({ error: 'prompt_id required' }, 400);
      if (!test_variables || typeof test_variables !== 'object') return json({ error: 'test_variables object required' }, 400);

      const { data: prompt } = await sb.from('prompt_templates').select('*').eq('id', prompt_id).single();
      if (!prompt) return json({ error: 'Prompt not found' }, 404);

      // Substitute {{variables}} with test values
      let rendered = prompt.template;
      for (const [key, value] of Object.entries(test_variables)) {
        rendered = rendered.replaceAll(`{{${key}}}`, String(value));
      }

      // Check for unresolved variables
      const unresolved = [...rendered.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
      if (unresolved.length > 0) {
        return json({ error: 'Unresolved variables in template', unresolved }, 400);
      }

      const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
      if (!ANTHROPIC_KEY) return json({ error: 'Anthropic API not configured' }, 500);

      const model = prompt.model ?? 'claude-haiku-4-5-20251001'; // default to cheapest
      const max_tokens = prompt.max_tokens ?? 500;
      const temperature = prompt.temperature ?? 0;

      const messages = prompt.role === 'system'
        ? [{ role: 'user', content: '(Test run — system prompt above)' }]
        : [{ role: prompt.role as string, content: rendered }];

      const reqBody: Record<string, unknown> = { model, max_tokens, messages };
      if (prompt.role === 'system') reqBody.system = rendered;
      if (temperature > 0) reqBody.temperature = temperature;

      const _br = await withAnthropicBreaker(sb, 'admin-filter-prompt', async () => {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(reqBody),
        });
        const result = await res.json();
        if (!res.ok && res.status === 402) throw new Error('402 credits exhausted');
        return { ok: res.ok, result, usage: result.usage };
      }, { model });
      if (_br.circuitOpen) return json({ error: 'AI temporarily unavailable (circuit breaker)' }, 503);
      const result = _br.result?.result ?? _br.result;

      await writeAudit(sb, {
        actor_id: admin.profile.id, action: 'prompt.test_run',
        target_type: 'prompt', target_id: prompt_id,
        after: { model, variables_used: Object.keys(test_variables), ok: res.ok },
      });

      return json({
        success: res.ok,
        rendered_prompt: rendered,
        model_used: model,
        response: result,
        usage: result.usage ?? null,
      });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    console.error('[admin-filter-prompt]', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

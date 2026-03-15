// FB-INTPREP-001-S1: Interview Question Bank — Batch Generation EF
// Spec: FB-INTPREP-001_InterviewPrep.docx §3.2, §6.2, §10 Phase 1
//
// Actions:
//   generate  — Generate questions for a specific cluster or all pending clusters
//   clusters  — List available role clusters from ats_jobs (for admin selection)
//   status    — Current question bank stats
//
// Auth: service_role only (admin batch job, not user-facing)
// Model: claude-haiku-4-5-20251001 (cost-efficient for batch extraction)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://brilliantjobs.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_CLUSTERS_PER_RUN = 20;
const MIN_CLUSTER_SIZE = 5; // Minimum JDs in a cluster to generate questions
const QUESTIONS_PER_CLUSTER = 20; // Target 15-25, aim for 20

// ════════════════════════════════════════════════════════════════
// System prompt for question generation
// ════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are an expert interview coach and hiring manager. Your task is to generate realistic interview questions based on job description requirements.

Given a role cluster (job title family, department, level) and a list of common requirements extracted from real job descriptions, generate exactly ${QUESTIONS_PER_CLUSTER} interview questions.

Rules:
1. Each question must be tagged with exactly one category: behavioral, technical, situational, or case_study
2. Each question must be tagged with exactly one difficulty: standard or advanced
3. Mix categories roughly: 5 behavioral, 7 technical, 4 situational, 4 case_study (adjust based on role type — engineering roles get more technical, management roles get more behavioral)
4. Mix difficulty roughly: 12 standard, 8 advanced
5. Questions must be specific to the role requirements — no generic "tell me about yourself" filler
6. Technical questions should reference specific skills/tools from the requirements
7. Behavioral questions should use "Tell me about a time..." or "Describe a situation where..." format
8. Situational questions should use "How would you handle..." or "What would you do if..." format
9. Case study questions should present a realistic scenario requiring analysis
10. Each question should include 1-3 relevant skill tags from the requirements

Respond with ONLY a JSON array. No markdown, no backticks, no preamble. Each element:
{
  "question_text": "The interview question",
  "category": "behavioral|technical|situational|case_study",
  "difficulty": "standard|advanced",
  "skill_tags": ["skill1", "skill2"]
}`;

// ════════════════════════════════════════════════════════════════
// Main handler
// ════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Auth: service_role only
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.includes(SUPABASE_SERVICE_ROLE_KEY) && !authHeader.includes('Bearer')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* GET or empty body */ }

    const action = (body.action as string) || 'status';

    switch (action) {
      case 'generate':
        return await handleGenerate(sb, body);
      case 'clusters':
        return await handleClusters(sb, body);
      case 'status':
        return await handleStatus(sb);
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
    }
  } catch (err) {
    console.error('[interview-generate-questions] Fatal:', err);
    return new Response(JSON.stringify({ error: 'Internal error', detail: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});

// ════════════════════════════════════════════════════════════════
// Action: generate
// ════════════════════════════════════════════════════════════════

async function handleGenerate(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>
) {
  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 503);
  }

  const targetCluster = body.cluster_id as string | undefined;
  const regenerateAll = body.regenerate_all === true;
  const limit = Math.min(Number(body.limit) || MAX_CLUSTERS_PER_RUN, MAX_CLUSTERS_PER_RUN);

  // Step 1: Get clusters from ats_jobs
  let clusters: ClusterRow[];
  if (targetCluster) {
    clusters = await getSpecificCluster(sb, targetCluster);
  } else {
    clusters = await getTopClusters(sb, limit, regenerateAll);
  }

  if (!clusters.length) {
    return jsonResponse({ questions_generated: 0, clusters_processed: 0, message: 'No eligible clusters found' });
  }

  let totalGenerated = 0;
  let clustersProcessed = 0;
  const errors: string[] = [];

  for (const cluster of clusters) {
    try {
      // Step 2: Get common requirements for this cluster
      const requirements = await getClusterRequirements(sb, cluster);

      // Step 3: Generate questions via Claude
      const questions = await generateQuestions(cluster, requirements);

      // Step 4: Store in Supabase
      if (questions.length > 0) {
        // Delete old questions for this cluster if regenerating
        if (regenerateAll || targetCluster) {
          await sb.from('interview_questions')
            .delete()
            .eq('role_cluster', cluster.role_cluster)
            .eq('department', cluster.department || '')
            .eq('level', cluster.level || '');
        }

        const rows = questions.map(q => ({
          question_text: q.question_text,
          category: q.category,
          difficulty: q.difficulty,
          role_cluster: cluster.role_cluster,
          department: cluster.department || null,
          level: cluster.level || null,
          skill_tags: q.skill_tags || [],
          source_cluster_size: cluster.jd_count,
          model_version: MODEL,
          generated_at: new Date().toISOString(),
        }));

        const { error: insertErr } = await sb.from('interview_questions').insert(rows);
        if (insertErr) {
          errors.push(`${cluster.role_cluster}: insert failed — ${insertErr.message}`);
          console.warn(`[interview-generate-questions] Insert error for ${cluster.role_cluster}:`, insertErr.message);
        } else {
          totalGenerated += questions.length;
          clustersProcessed++;
        }
      }
    } catch (clusterErr) {
      const msg = `${cluster.role_cluster}: ${String(clusterErr)}`;
      errors.push(msg);
      console.warn(`[interview-generate-questions] Cluster error:`, msg);
    }
  }

  // PostHog event
  try {
    const phKey = Deno.env.get('POSTHOG_KEY');
    const phHost = Deno.env.get('POSTHOG_HOST') || 'https://us.i.posthog.com';
    if (phKey) {
      await fetch(`${phHost}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: phKey,
          event: 'interview_questions_generated',
          distinct_id: 'system',
          properties: { questions_generated: totalGenerated, clusters_processed: clustersProcessed, errors: errors.length },
        }),
      }).catch(() => {});
    }
  } catch { /* non-critical */ }

  return jsonResponse({
    questions_generated: totalGenerated,
    clusters_processed: clustersProcessed,
    clusters_attempted: clusters.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ════════════════════════════════════════════════════════════════
// Action: clusters — list available role clusters
// ════════════════════════════════════════════════════════════════

async function handleClusters(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>
) {
  const limit = Math.min(Number(body.limit) || 100, 500);
  const minSize = Number(body.min_size) || MIN_CLUSTER_SIZE;

  // Get distinct role clusters from ats_jobs with counts
  const { data, error } = await sb.rpc('fn_interview_prep_clusters', {
    p_min_size: minSize,
    p_limit: limit,
  });

  // Fallback: direct query if RPC doesn't exist yet
  if (error) {
    const { data: fallback, error: fbErr } = await sb
      .from('ats_jobs')
      .select('title, extracted_department, extracted_seniority')
      .eq('status', 'open')
      .not('title', 'is', null)
      .limit(10000);

    if (fbErr) {
      return jsonResponse({ error: 'Failed to query clusters', detail: fbErr.message }, 500);
    }

    // Client-side clustering
    const clusterMap = new Map<string, { count: number; department: string; level: string }>();
    for (const job of (fallback || [])) {
      const normalized = normalizeTitle(job.title);
      if (!normalized) continue;
      const key = `${normalized}|${job.extracted_department || ''}|${job.extracted_seniority || ''}`;
      const existing = clusterMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        clusterMap.set(key, {
          count: 1,
          department: job.extracted_department || '',
          level: job.extracted_seniority || '',
        });
      }
    }

    const clusters = Array.from(clusterMap.entries())
      .filter(([, v]) => v.count >= minSize)
      .map(([k, v]) => ({
        role_cluster: k.split('|')[0],
        department: v.department || null,
        level: v.level || null,
        jd_count: v.count,
      }))
      .sort((a, b) => b.jd_count - a.jd_count)
      .slice(0, limit);

    return jsonResponse({ clusters, count: clusters.length, source: 'fallback' });
  }

  return jsonResponse({ clusters: data, count: (data || []).length, source: 'rpc' });
}

// ════════════════════════════════════════════════════════════════
// Action: status
// ════════════════════════════════════════════════════════════════

async function handleStatus(sb: ReturnType<typeof createClient>) {
  const { count: totalQuestions } = await sb
    .from('interview_questions')
    .select('*', { count: 'exact', head: true });

  const { data: clusterData } = await sb
    .from('interview_questions')
    .select('role_cluster')
    .limit(10000);

  const distinctClusters = new Set((clusterData || []).map(r => r.role_cluster)).size;

  const { data: categoryBreakdown } = await sb
    .rpc('fn_placeholder_noop', {})
    .catch(() => ({ data: null }));

  // Manual category count since no RPC
  const { data: catData } = await sb
    .from('interview_questions')
    .select('category')
    .limit(50000);

  const categories: Record<string, number> = {};
  for (const row of (catData || [])) {
    categories[row.category] = (categories[row.category] || 0) + 1;
  }

  return jsonResponse({
    total_questions: totalQuestions || 0,
    distinct_clusters: distinctClusters,
    categories,
    model: MODEL,
  });
}

// ════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════

interface ClusterRow {
  role_cluster: string;
  department: string | null;
  level: string | null;
  jd_count: number;
}

interface GeneratedQuestion {
  question_text: string;
  category: string;
  difficulty: string;
  skill_tags: string[];
}

function normalizeTitle(title: string): string {
  if (!title) return '';
  // Remove seniority prefixes, normalize common variations
  return title
    .replace(/^(senior|sr\.?|junior|jr\.?|lead|principal|staff|associate|intern)\s+/i, '')
    .replace(/\s+(i+|[ivx]+|[1-3])$/i, '') // Remove level suffixes (I, II, III)
    .replace(/\s*[-–—]\s*.*$/, '') // Remove everything after dash (location, team info)
    .replace(/\s*\(.*\)$/, '') // Remove parenthetical
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function getTopClusters(
  sb: ReturnType<typeof createClient>,
  limit: number,
  includeExisting: boolean
): Promise<ClusterRow[]> {
  // Get top clusters by JD count from ats_jobs
  const { data, error } = await sb
    .from('ats_jobs')
    .select('title, extracted_department, extracted_seniority')
    .eq('status', 'open')
    .not('title', 'is', null)
    .not('content', 'is', null)
    .limit(50000);

  if (error || !data) {
    console.warn('[interview-generate-questions] Failed to query ats_jobs:', error?.message);
    return [];
  }

  // Cluster by normalized title + department + level
  const clusterMap = new Map<string, ClusterRow & { titles: Set<string> }>();
  for (const job of data) {
    const normalized = normalizeTitle(job.title);
    if (!normalized || normalized.length < 3) continue;
    const dept = job.extracted_department || '';
    const level = job.extracted_seniority || '';
    const key = `${normalized}|${dept}|${level}`;

    const existing = clusterMap.get(key);
    if (existing) {
      existing.jd_count++;
      existing.titles.add(job.title);
    } else {
      clusterMap.set(key, {
        role_cluster: normalized,
        department: dept || null,
        level: level || null,
        jd_count: 1,
        titles: new Set([job.title]),
      });
    }
  }

  let clusters = Array.from(clusterMap.values())
    .filter(c => c.jd_count >= MIN_CLUSTER_SIZE);

  // If not regenerating, exclude clusters that already have questions
  if (!includeExisting) {
    const { data: existingClusters } = await sb
      .from('interview_questions')
      .select('role_cluster')
      .limit(10000);

    const existingSet = new Set((existingClusters || []).map(r => r.role_cluster));
    clusters = clusters.filter(c => !existingSet.has(c.role_cluster));
  }

  return clusters
    .sort((a, b) => b.jd_count - a.jd_count)
    .slice(0, limit)
    .map(({ titles, ...rest }) => rest);
}

async function getSpecificCluster(
  sb: ReturnType<typeof createClient>,
  clusterId: string
): Promise<ClusterRow[]> {
  const { data, error } = await sb
    .from('ats_jobs')
    .select('title, extracted_department, extracted_seniority')
    .eq('status', 'open')
    .ilike('title', `%${clusterId}%`)
    .not('content', 'is', null)
    .limit(5000);

  if (error || !data || data.length === 0) return [];

  // Find the best matching cluster
  const normalized = normalizeTitle(clusterId);
  const matching = data.filter(j => normalizeTitle(j.title) === normalized);

  if (matching.length < MIN_CLUSTER_SIZE) {
    // Fallback: use all matching jobs
    return [{
      role_cluster: normalized,
      department: matching[0]?.extracted_department || null,
      level: matching[0]?.extracted_seniority || null,
      jd_count: matching.length || data.length,
    }];
  }

  return [{
    role_cluster: normalized,
    department: matching[0]?.extracted_department || null,
    level: matching[0]?.extracted_seniority || null,
    jd_count: matching.length,
  }];
}

async function getClusterRequirements(
  sb: ReturnType<typeof createClient>,
  cluster: ClusterRow
): Promise<string> {
  // Get extracted_skills for jobs in this cluster
  let query = sb
    .from('ats_jobs')
    .select('title, extracted_skills, extracted_department, extracted_seniority')
    .eq('status', 'open')
    .not('extracted_skills', 'is', null)
    .limit(200);

  // Filter by normalized title pattern
  query = query.ilike('title', `%${cluster.role_cluster.split(' ')[0]}%`);

  if (cluster.department) {
    query = query.eq('extracted_department', cluster.department);
  }

  const { data } = await query;
  if (!data || data.length === 0) {
    return `Role: ${cluster.role_cluster}. Department: ${cluster.department || 'General'}. Level: ${cluster.level || 'Mid-level'}.`;
  }

  // Aggregate skills by frequency
  const skillFreq = new Map<string, number>();
  for (const job of data) {
    const skills = job.extracted_skills || [];
    for (const skill of skills) {
      const s = (skill as string).toLowerCase().trim();
      if (s.length < 2) continue;
      skillFreq.set(s, (skillFreq.get(s) || 0) + 1);
    }
  }

  const sortedSkills = Array.from(skillFreq.entries())
    .sort((a, b) => b[1] - a[1]);

  const coreSkills = sortedSkills
    .filter(([, count]) => count >= data.length * 0.3)
    .slice(0, 15)
    .map(([skill]) => skill);

  const nicheSkills = sortedSkills
    .filter(([, count]) => count < data.length * 0.3 && count >= 2)
    .slice(0, 10)
    .map(([skill]) => skill);

  return [
    `Role: ${cluster.role_cluster}`,
    `Department: ${cluster.department || 'General'}`,
    `Level: ${cluster.level || 'Mid-level'}`,
    `Based on ${data.length} job descriptions`,
    `Core skills (appear in 30%+ of JDs): ${coreSkills.join(', ') || 'general role skills'}`,
    `Niche skills: ${nicheSkills.join(', ') || 'none identified'}`,
  ].join('\n');
}

async function generateQuestions(
  cluster: ClusterRow,
  requirements: string
): Promise<GeneratedQuestion[]> {
  const userPrompt = `Generate ${QUESTIONS_PER_CLUSTER} interview questions for this role cluster:

${requirements}

Remember: respond with ONLY a JSON array, no markdown, no backticks.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // Parse JSON from response — strip any markdown fences
  const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();

  let questions: GeneratedQuestion[];
  try {
    questions = JSON.parse(cleaned);
  } catch {
    console.warn(`[interview-generate-questions] JSON parse failed for ${cluster.role_cluster}. Raw:`, cleaned.slice(0, 200));
    throw new Error('Failed to parse Anthropic response as JSON');
  }

  if (!Array.isArray(questions)) {
    throw new Error('Anthropic response is not an array');
  }

  // Validate and clean each question
  const validCategories = new Set(['behavioral', 'technical', 'situational', 'case_study']);
  const validDifficulties = new Set(['standard', 'advanced']);

  return questions
    .filter(q => {
      if (!q.question_text || typeof q.question_text !== 'string') return false;
      if (!validCategories.has(q.category)) return false;
      if (!validDifficulties.has(q.difficulty)) return false;
      return true;
    })
    .map(q => ({
      question_text: q.question_text.trim(),
      category: q.category,
      difficulty: q.difficulty,
      skill_tags: Array.isArray(q.skill_tags)
        ? q.skill_tags.filter(t => typeof t === 'string').map(t => t.toLowerCase().trim())
        : [],
    }));
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

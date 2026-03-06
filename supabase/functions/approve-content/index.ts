// approve-content Edge Function
// Content Engine Item #15: Editorial Approval Gate
// Routes content_stories from pending_review → published or rejected.
// Requires authenticated admin user (CPO or editorial reviewer).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth check — extract user from JWT
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    // CS-006: Allow service_role calls (from cron), otherwise verify admin
    let isServiceRole = false;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      isServiceRole = payload.role === "service_role";
    } catch { /* not a valid JWT — will fail user auth below */ }

    let userId: string | undefined;
    let userEmail: string | undefined;

    if (isServiceRole) {
      userId = "service_role";
      userEmail = "service_role";
    } else {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser(token);

      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // CS-006: AD-FIX-03 — Verify admin role via profiles table
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin only" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = user.id;
      userEmail = user.email;
    }

    // Parse request body
    const body = await req.json();
    const { story_id, action, review_notes } = body as {
      story_id: number;
      action: "approve" | "reject" | "list";
      review_notes?: string;
    };

    // ─── LIST: Return stories awaiting review ───
    if (action === "list") {
      const { data: stories, error: listErr } = await supabase
        .from("content_stories")
        .select(
          "id, story_type, headline, lede, body_html, chart_config, meta_description, social_snippet, tags, score, validation_score, validation_result, retry_count, model_used, generation_latency_ms, created_at, updated_at"
        )
        .in("status", ["pending_review", "validation_failed_final"])
        .order("updated_at", { ascending: false })
        .limit(20);

      if (listErr) throw listErr;

      return new Response(
        JSON.stringify({
          pending_review: (stories || []).filter(
            (s: Record<string, unknown>) => true
          ).length,
          stories: stories || [],
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─── APPROVE or REJECT ───
    if (!story_id || !["approve", "reject"].includes(action)) {
      return new Response(
        JSON.stringify({
          error:
            'Missing story_id or invalid action. Use "approve", "reject", or "list".',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch the story to verify it's in the right state
    const { data: story, error: fetchErr } = await supabase
      .from("content_stories")
      .select("*")
      .eq("id", story_id)
      .single();

    if (fetchErr || !story) {
      return new Response(
        JSON.stringify({ error: `Story ${story_id} not found` }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      !["pending_review", "validation_failed_final"].includes(story.status)
    ) {
      return new Response(
        JSON.stringify({
          error: `Story ${story_id} is in status '${story.status}' — only pending_review and validation_failed_final stories can be approved/rejected`,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "approve") {
      const { error: updateErr } = await supabase
        .from("content_stories")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          review_notes: review_notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", story_id);

      if (updateErr) throw updateErr;

      return new Response(
        JSON.stringify({
          success: true,
          story_id,
          action: "approved",
          status: "published",
          reviewed_by: userEmail,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "reject") {
      const { error: updateErr } = await supabase
        .from("content_stories")
        .update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          review_notes: review_notes || "Rejected by editorial reviewer",
          updated_at: new Date().toISOString(),
        })
        .eq("id", story_id);

      if (updateErr) throw updateErr;

      return new Response(
        JSON.stringify({
          success: true,
          story_id,
          action: "rejected",
          status: "rejected",
          reviewed_by: userEmail,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Approval error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

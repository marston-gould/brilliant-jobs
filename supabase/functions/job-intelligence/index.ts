// job-intelligence Edge Function
// Triggered daily (after job refresh). Scans for:
// 1. Ghost alerts — applied 14+ days ago, no pipeline advancement
// 2. Company hiring surges — companies the user applied to posted 3+ new roles today
// 3. Network matches — connections at companies with new roles matching filters
// 4. Connection moved — a connection started at a company matching user's filters
// Sends individual emails for high-priority items, batches lower-priority into daily digest.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  ghostAlertEmail,
  companyNewRolesEmail,
  networkMatchEmail,
} from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GHOST_THRESHOLD_DAYS = 14;
const SURGE_THRESHOLD = 3; // 3+ new roles = hiring surge

async function sendNotification(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("[job-intelligence] send-notification call failed:", e);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600000).toISOString();

  let ghostsSent = 0;
  let surgesSent = 0;
  let networkSent = 0;

  try {
    // Get all users with notification preferences
    const { data: allPrefs } = await sb
      .from("notification_preferences")
      .select("user_id, email_enabled");

    if (!allPrefs || allPrefs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users", ghostsSent: 0, surgesSent: 0, networkSent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    for (const prefs of allPrefs) {
      if (prefs.email_enabled === false) continue;
      const userId = prefs.user_id;

      // ================================================================
      // 1. GHOST ALERTS (Phase 1 — using ghost scoring engine)
      // Uses get_pipeline_ghost_status() RPC for scored detection
      // and ghost_alerts_sent for deduplication
      // ================================================================
      const { data: ghostChannel } = await sb
        .from("notification_channels")
        .select("email")
        .eq("user_id", userId)
        .eq("notification_type", "ghost_alert")
        .single();

      // Default to enabled
      if (!ghostChannel || ghostChannel.email !== false) {
        // Use the ghost scoring RPC
        const { data: ghostEntries, error: ghostErr } = await sb
          .rpc("get_pipeline_ghost_status", { p_user_id: userId });

        if (ghostErr) {
          console.warn(`[job-intelligence] Ghost RPC error for ${userId}:`, ghostErr.message);
        }

        // Filter to only ghosted/likely_ghosted entries
        const alertCandidates = (ghostEntries || []).filter(
          (e: any) => e.ghost_status === "ghosted" || e.ghost_status === "likely_ghosted"
        );

        for (const g of alertCandidates) {
          // Dedup: check ghost_alerts_sent table
          const { data: alreadySent } = await sb
            .from("ghost_alerts_sent")
            .select("sent_at")
            .eq("user_id", userId)
            .eq("pipeline_entry_id", g.pipeline_entry_id)
            .eq("ghost_status", g.ghost_status)
            .single();

          if (alreadySent) continue;

          // Get company avg response days from ghost stats
          const avgDays = 8; // fallback, ghost_score factors already include company history

          const email = ghostAlertEmail(
            g.company_name || g.company_slug,
            g.job_title,
            g.days_since_applied,
            avgDays
          );

          await sendNotification({
            user_id: userId,
            notification_type: "ghost_alert",
            subject: email.subject,
            html: email.html,
            company_name: g.company_name || g.company_slug,
            job_title: g.job_title,
            force_channel: "email",
            metadata: {
              ghost_score: g.ghost_score,
              ghost_status: g.ghost_status,
              confidence: g.confidence,
            },
          });

          // Record in dedup table
          await sb.from("ghost_alerts_sent").upsert({
            user_id: userId,
            pipeline_entry_id: g.pipeline_entry_id,
            ghost_status: g.ghost_status,
          });

          ghostsSent++;
        }
      }

      // ================================================================
      // 2. COMPANY HIRING SURGES
      // Companies the user applied to that posted 3+ new roles today
      // ================================================================
      const { data: surgeChannel } = await sb
        .from("notification_channels")
        .select("email")
        .eq("user_id", userId)
        .eq("notification_type", "company_hiring_surge")
        .single();

      if (!surgeChannel || surgeChannel.email !== false) {
        // Get companies the user has applied to
        const { data: appliedCompanies } = await sb
          .from("notification_actions")
          .select("company_name")
          .eq("user_id", userId)
          .eq("status", "accepted");

        const companyNames = [...new Set((appliedCompanies || []).map((a) => a.company_name).filter(Boolean))];

        for (const company of companyNames) {
          // Count new roles posted today at this company
          const { data: newRoles, count } = await sb
            .from("ats_jobs")
            .select("title", { count: "exact" })
            .eq("company_name", company)
            .gte("first_seen_at", yesterday)
            .eq("status", "open")
            .limit(10);

          if ((count || 0) >= SURGE_THRESHOLD) {
            const roles = (newRoles || []).map((r) => r.title);
            const email = companyNewRolesEmail(company, count || 0, roles);

            await sendNotification({
              user_id: userId,
              notification_type: "company_new_roles",
              subject: email.subject,
              html: email.html,
              company_name: company,
              force_channel: "email",
            });

            surgesSent++;
          }
        }
      }

      // ================================================================
      // 3. NETWORK MATCHES
      // User's connections at companies that posted new roles
      // ================================================================
      const { data: networkChannel } = await sb
        .from("notification_channels")
        .select("email, sms")
        .eq("user_id", userId)
        .eq("notification_type", "connections_at_company")
        .single();

      if (!networkChannel || networkChannel.email !== false) {
        // Get user's connections grouped by company
        const { data: connections } = await sb
          .from("connections")
          .select("full_name, company_name")
          .eq("user_id", userId)
          .not("company_name", "is", null);

        if (connections && connections.length > 0) {
          // Group connections by company
          const companyConnections: Record<string, string[]> = {};
          for (const conn of connections) {
            if (!conn.company_name) continue;
            if (!companyConnections[conn.company_name]) {
              companyConnections[conn.company_name] = [];
            }
            companyConnections[conn.company_name].push(conn.full_name);
          }

          // Check which of these companies posted new roles today
          for (const [company, names] of Object.entries(companyConnections)) {
            const { data: newRoles } = await sb
              .from("ats_jobs")
              .select("title")
              .eq("company_name", company)
              .gte("first_seen_at", yesterday)
              .eq("status", "open")
              .limit(1);

            if (newRoles && newRoles.length > 0) {
              const jobTitle = newRoles[0].title;

              // Check if already notified about this company today
              const { count: recentNotif } = await sb
                .from("notification_log")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("notification_type", "connections_at_company")
                .eq("company_name", company)
                .gte("created_at", yesterday);

              if ((recentNotif || 0) > 0) continue;

              const email = networkMatchEmail(company, jobTitle, names);

              await sendNotification({
                user_id: userId,
                notification_type: "connections_at_company",
                subject: email.subject,
                html: email.html,
                company_name: company,
                job_title: jobTitle,
                force_channel: networkChannel?.sms ? undefined : "email",
              });

              networkSent++;
            }
          }
        }
      }
    }

    const summary = { ghostsSent, surgesSent, networkSent, checked_at: now.toISOString() };
    console.log("[job-intelligence] Complete:", summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[job-intelligence] Error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


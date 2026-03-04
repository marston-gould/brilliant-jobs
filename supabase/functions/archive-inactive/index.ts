// archive-inactive Edge Function — v1 (v6.77)
// Cron-triggered daily at 12:00 PM ET (17:00 UTC), runs after re-engagement.
// Archives accounts that have been inactive for 91+ days:
//   - Sets profiles.archived_at = now()
//   - Sets profiles.archive_reason = 'inactivity_91d'
//   - Sends archive confirmation email with reactivation + $5/yr storage CTA
//   - Skips users who have paid the $5/yr storage fee (archive_storage_paid_until > now)
//   - Skips already-archived users
//   - Reactivation: any login clears archived_at and restores full access
// Deploy: supabase functions deploy archive-inactive --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { archiveConfirmationEmail } from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DASHBOARD_URL = "https://brilliantjobs.app/dashboard";
const ARCHIVE_THRESHOLD_DAYS = 91;

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

  const results = { archived: 0, skipped_storage_paid: 0, skipped_already_archived: 0, errors: 0 };

  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - ARCHIVE_THRESHOLD_DAYS * 86400000);

    // Find users eligible for archival:
    // - last_sign_in_at < 91 days ago (or null with created_at < 91 days)
    // - NOT already archived
    // - NOT covered by storage fee payment
    // - IS approved (don't archive pending users)
    const { data: users, error: usersErr } = await sb.rpc("get_archivable_users", {
      cutoff_date: cutoff.toISOString(),
    });

    // Fallback if RPC doesn't exist yet: direct query
    let candidates = users;
    if (usersErr || !users) {
      console.log("[archive-inactive] RPC not available, using direct query");

      // Query profiles directly
      const { data: profiles, error: profErr } = await sb
        .from("profiles")
        .select("id, email, full_name, archived_at, archive_storage_paid_until")
        .is("archived_at", null)
        .eq("approved", true)
        .or(`archive_storage_paid_until.is.null,archive_storage_paid_until.lt.${now.toISOString()}`);

      if (profErr || !profiles) {
        console.error("[archive-inactive] Error fetching profiles:", profErr);
        return new Response(JSON.stringify({ error: "Failed to fetch profiles" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Now check auth.users for last_sign_in_at via RPC
      // Filter to those inactive 91+ days
      const eligibleIds: string[] = [];
      for (const p of profiles) {
        // Skip if storage is paid
        if (p.archive_storage_paid_until && new Date(p.archive_storage_paid_until) > now) {
          results.skipped_storage_paid++;
          continue;
        }
        eligibleIds.push(p.id);
      }

      if (eligibleIds.length === 0) {
        console.log("[archive-inactive] No candidates after storage fee filter");
        return new Response(JSON.stringify(results), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Check last_sign_in_at for each candidate
      // Use the same RPC as re-engagement
      const { data: inactiveUsers } = await sb.rpc("get_inactive_users", {
        range_start: new Date(0).toISOString(), // Beginning of time
        range_end: cutoff.toISOString(),         // 91+ days ago
      });

      if (!inactiveUsers || inactiveUsers.length === 0) {
        console.log("[archive-inactive] No inactive users found via auth check");
        return new Response(JSON.stringify(results), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Intersect: must be in both eligible profiles AND inactive auth users
      const inactiveIds = new Set(inactiveUsers.map((u: any) => u.id));
      const eligibleSet = new Set(eligibleIds);
      candidates = inactiveUsers.filter((u: any) => eligibleSet.has(u.id) && inactiveIds.has(u.id));
    }

    if (!candidates || candidates.length === 0) {
      console.log("[archive-inactive] No users to archive");
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[archive-inactive] ${candidates.length} candidates for archival`);

    for (const user of candidates) {
      try {
        const userId = user.id;
        const email = user.email;
        const firstName = (user.raw_user_meta_data?.full_name as string)?.split(" ")[0]
          || (user.raw_user_meta_data?.name as string)?.split(" ")[0]
          || undefined;

        // Double-check: is this user already archived?
        const { data: profile } = await sb
          .from("profiles")
          .select("archived_at, archive_storage_paid_until")
          .eq("id", userId)
          .single();

        if (profile?.archived_at) {
          results.skipped_already_archived++;
          continue;
        }

        if (profile?.archive_storage_paid_until &&
            new Date(profile.archive_storage_paid_until) > now) {
          results.skipped_storage_paid++;
          continue;
        }

        // ─── Archive the account ───
        const { error: updateErr } = await sb
          .from("profiles")
          .update({
            archived_at: now.toISOString(),
            archive_reason: "inactivity_91d",
          })
          .eq("id", userId);

        if (updateErr) {
          console.error(`[archive-inactive] Failed to archive ${userId}:`, updateErr);
          results.errors++;
          continue;
        }

        // ─── Send archive confirmation email ───
        const emailContent = archiveConfirmationEmail(firstName, DASHBOARD_URL);

        const notifPayload = {
          user_id: userId,
          notification_type: "account_archived",
          subject: emailContent.subject,
          html: emailContent.html,
          payload: {
            archive_reason: "inactivity_91d",
            archived_at: now.toISOString(),
          },
          idempotency_key: `archive_${userId}_${now.toISOString().slice(0, 10)}`,
          template_version: "1.0.0",
        };

        const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(notifPayload),
        });

        if (sendResp.ok) {
          results.archived++;
          console.log(`[archive-inactive] ARCHIVED ${userId} (${email})`);
        } else {
          // Account is archived even if email fails
          results.archived++;
          const err = await sendResp.text();
          console.warn(`[archive-inactive] Archived ${userId} but email failed: ${err}`);
        }

      } catch (userErr) {
        console.error(`[archive-inactive] Error processing user ${user.id}:`, userErr);
        results.errors++;
      }
    }

    console.log("[archive-inactive] Summary:", results);
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[archive-inactive] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

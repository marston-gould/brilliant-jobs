// cleanup-orphans Edge Function
// C2: Find and remove storage files with no matching resumes row
// Architecture Review §31
// Date: 2026-02-19
//
// Schedule via pg_cron weekly: SELECT net.http_post(...)
// Deploy: supabase functions deploy cleanup-orphans --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createLogger } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const logger = createLogger("cleanup-orphans");
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Get all file paths from the resumes table (including soft-deleted within 30 days)
    const { data: dbResumes, error: dbErr } = await sb
      .from("resumes")
      .select("file_path")
      .not("file_path", "is", null);

    if (dbErr) throw new Error(dbErr.message);

    const dbPaths = new Set((dbResumes || []).map((r: { file_path: string }) => r.file_path));
    logger.info("Database resume paths", { count: dbPaths.size });

    // List all files in storage
    // First get user folders
    const { data: folders, error: folderErr } = await sb.storage
      .from("resumes")
      .list("", { limit: 1000 });

    if (folderErr) throw new Error(folderErr.message);

    let orphans: string[] = [];
    let totalFiles = 0;

    for (const folder of folders || []) {
      if (!folder.id) continue; // Skip non-folder items

      const { data: files } = await sb.storage
        .from("resumes")
        .list(folder.name, { limit: 1000 });

      for (const file of files || []) {
        const fullPath = `${folder.name}/${file.name}`;
        totalFiles++;

        if (!dbPaths.has(fullPath)) {
          // Check file age — only delete if older than 7 days (grace period)
          const fileDate = new Date(file.created_at);
          const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

          if (fileDate < sevenDaysAgo) {
            orphans.push(fullPath);
          }
        }
      }
    }

    logger.info("Scan complete", { totalFiles, orphans: orphans.length });

    // Delete orphans
    if (orphans.length > 0) {
      const { error: delErr } = await sb.storage
        .from("resumes")
        .remove(orphans);

      if (delErr) {
        logger.error("Failed to delete orphans", { error: delErr.message });
      } else {
        logger.info("Deleted orphans", { count: orphans.length, paths: orphans });
      }

      // Audit log
      await sb.from("audit_log").insert({
        action: "orphan_cleanup",
        resource_type: "storage",
        details: { deleted: orphans.length, paths: orphans },
      });
    }

    return new Response(
      JSON.stringify({ scanned: totalFiles, orphans: orphans.length, deleted: orphans.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    logger.error("Cleanup failed", { error: e instanceof Error ? e.message : String(e) });
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

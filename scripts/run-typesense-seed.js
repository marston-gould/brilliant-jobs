#!/usr/bin/env node
/**
 * run-typesense-seed.js
 * Orchestrates the typesense-seed Edge Function for full initial index.
 *
 * Usage:
 *   node scripts/run-typesense-seed.js
 *   node scripts/run-typesense-seed.js --dry-run
 *   node scripts/run-typesense-seed.js --offset 50000   # resume from offset
 *
 * Requires: SUPABASE_SERVICE_KEY environment variable (or set in .env)
 */

const SUPABASE_URL = "https://qojhagupdnbtomfoxnsf.supabase.co";
const EF_URL = `${SUPABASE_URL}/functions/v1/typesense-seed`;
const BATCH_SIZE = 500;
const DELAY_MS = 200; // gentle throttle between batches

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const offsetArg = args.indexOf("--offset");
let startOffset = offsetArg !== -1 ? parseInt(args[offsetArg + 1], 10) : 0;

const serviceKey = process.env.SUPABASE_SERVICE_KEY;
if (!serviceKey) {
  console.error("❌ SUPABASE_SERVICE_KEY environment variable is required");
  process.exit(1);
}

async function callSeedEF(offset) {
  const res = await fetch(EF_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      batch_size: BATCH_SIZE,
      offset,
      status_filter: "open",
      dry_run: isDryRun,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`\n🚀 Typesense Seed${isDryRun ? " (DRY RUN)" : ""}`);
  console.log(`   Batch size: ${BATCH_SIZE}`);
  console.log(`   Start offset: ${startOffset}`);
  console.log(`   Target: ~413,929 open jobs\n`);

  let offset = startOffset;
  let totalImported = 0;
  let totalErrors = 0;
  let batchNum = 0;
  const startTime = Date.now();

  while (true) {
    batchNum++;
    const batchStart = Date.now();

    let result;
    try {
      result = await callSeedEF(offset);
    } catch (err) {
      console.error(`❌ Batch ${batchNum} (offset=${offset}) FAILED:`, err.message);
      console.log(`   Resume with: node scripts/run-typesense-seed.js --offset ${offset}`);
      process.exit(1);
    }

    totalImported += result.total_imported ?? 0;
    totalErrors += result.total_errors ?? 0;
    const batchMs = Date.now() - batchStart;
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    const progress = totalImported > 0
      ? `${((totalImported / 413929) * 100).toFixed(1)}%`
      : "0%";

    console.log(
      `   Batch ${String(batchNum).padStart(4, "0")} | offset=${String(offset).padStart(7, " ")} | ` +
      `imported=${String(result.total_imported ?? 0).padStart(4, " ")} | ` +
      `errors=${result.total_errors ?? 0} | ` +
      `${batchMs}ms | ` +
      `total=${totalImported.toLocaleString()} (${progress}) | elapsed=${elapsed}s`
    );

    if (result.error_samples?.length > 0) {
      console.log(`   ⚠️  Error samples:`, result.error_samples);
    }

    if (result.status === "complete" || !result.next_offset) {
      break;
    }

    offset = result.next_offset;
    await sleep(DELAY_MS);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n✅ Seed complete!`);
  console.log(`   Total imported: ${totalImported.toLocaleString()}`);
  console.log(`   Total errors:   ${totalErrors.toLocaleString()}`);
  console.log(`   Total time:     ${totalTime}s (${(totalTime / 60).toFixed(1)} min)`);
  console.log(`   Avg per batch:  ${Math.round((totalTime * 1000) / batchNum)}ms`);

  if (totalErrors > 0) {
    console.log(`\n⚠️  ${totalErrors} errors occurred. Check Supabase Edge Function logs for details.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

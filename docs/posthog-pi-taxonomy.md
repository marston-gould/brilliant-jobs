# Pipeline Intelligence — PostHog Event Taxonomy

**Last updated:** 2026-03-15 (SCA-REM-S4)
**Total events:** 19

---

## Server-Side Events (Edge Functions)

### classify-pipeline-signal EF

| Event | Properties | Trigger |
|-------|-----------|---------|
| `pipeline_signal_classified` | signal_type, confidence_score, confidence_level, company_name, role_title, source, matched_application_id | Each signal classified by AI |
| `classifier_cache_hit` | signal_type, source_message_id | Duplicate signal skipped |
| `classifier_error` | error, source_message_id | Single signal classification failure |
| `classifier_batch_complete` | total, classified, skipped, errored, duration_ms | Batch run complete |
| `classifier_fatal_error` | error | Entire batch failed |

### process-pipeline-action EF

| Event | Properties | Trigger |
|-------|-----------|---------|
| `pipeline_signal_processed` | action, signal_type, confidence_level, company_name | Signal processed (prompt/auto-move/skip) |
| `pipeline_stage_auto_moved` | application_id, company_name, from_stage, to_stage, signal_type | Auto-move executed (medium+ confidence) |
| `pipeline_action_batch_complete` | total, processed, auto_moved, prompted, skipped, errored, duration_ms | Batch run complete |
| `pipeline_action_fatal_error` | error | Entire batch failed |

### check-pipeline-staleness EF

| Event | Properties | Trigger |
|-------|-----------|---------|
| `pipeline_staleness_prompt` | application_id, company_name, stage, days_stale | Stale application prompt created |

---

## Client-Side Events (pipeline.js)

### Signal Detection & Resolution

| Event | Properties | Trigger |
|-------|-----------|---------|
| `signal_detected` | count, sources | New signals shown in notification center |
| `low_confidence_signal_resolved` | action, stage | User resolves low-confidence prompt (confirm/dismiss/move) |

### Untracked Applications

| Event | Properties | Trigger |
|-------|-----------|---------|
| `untracked_app_confirmed` | company, stage | User confirms an untracked application |
| `untracked_app_dismissed` | — | User dismisses untracked app prompt |

### Pipeline Stage Management

| Event | Properties | Trigger |
|-------|-----------|---------|
| `pipeline_stage_changed` | application_id, company, from_stage, to_stage, method | User manually moves an application between stages |
| `pipeline_entry_created` | company, role, stage, source | New pipeline entry created (manual or auto) |
| `auto_move_undone` | prev_stage | User undoes an auto-move |

### Staleness

| Event | Properties | Trigger |
|-------|-----------|---------|
| `staleness_prompt_resolved` | action, stage | User responds to staleness prompt (move/correct) |
| `staleness_prompt_archived` | — | User archives stale application |
| `staleness_prompt_snoozed` | days | User snoozes staleness prompt |
| `auto_archive_undone` | prev_stage | User undoes auto-archive |

---

## Dashboard Recommendations

### Key Funnels
1. **Signal → Action:** `pipeline_signal_classified` → `pipeline_signal_processed` → `pipeline_stage_auto_moved` (conversion = auto-move rate)
2. **Low Confidence Resolution:** `low_confidence_signal_resolved` by action (confirm vs dismiss ratio)
3. **Staleness Cycle:** `pipeline_staleness_prompt` → `staleness_prompt_resolved` / `staleness_prompt_archived` / `staleness_prompt_snoozed`

### Key Metrics
- **Classifier accuracy proxy:** `confidence_level` distribution (high/medium/low) over time
- **Auto-move rate:** `pipeline_stage_auto_moved` / `pipeline_signal_processed`
- **User engagement:** `staleness_prompt_resolved` + `low_confidence_signal_resolved` per user per week
- **Error rate:** `classifier_error` + `classifier_fatal_error` / `classifier_batch_complete`

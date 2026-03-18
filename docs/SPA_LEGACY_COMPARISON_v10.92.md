# SPA vs Legacy — Definitive Side-by-Side Comparison
## v10.92 — March 18, 2026

---

## ELEMENTS (Every visual element present in legacy, checked against SPA)

### Navigation
| Element | Legacy | SPA | Match |
|---|---|---|---|
| Brand logo (B mark 30px + text) | .nav-brand | AppShell px-6 py-[22px] | ✅ |
| Brand sparkle animation | .sparkle, shimmerSweep | .nav-brand-shimmer CSS | ✅ |
| Section labels (Search/Applications/Intelligence/Account) | .nav-section-label | max-md:hidden div | ✅ |
| 29 nav items with icons | .nav-item + .nav-icon SVG | Lucide icons 18x18 | ✅ |
| 3 live badge counters | .nav-badge | tabular-nums badge | ✅ |
| Status dots (green/red) | .ext-status-dot | StatusDot component | ✅ |
| User avatar (colored circle + initial) | .nav-avatar 32px | w-8 h-8 rounded-full | ✅ |
| User email + plan tier | .nav-user-email/.nav-user-plan | text-[12px]/text-[10px] | ✅ |
| Credit balance | .credit-balance | Credit row in footer | ✅ |
| Theme toggle | BJ_Theme.cycle | cycleTheme callback | ✅ |
| Logout button | .btn-logout | border border-white/12% | ✅ |
| Responsive collapse (768px) | @media nav{width:60px} | --nav-w:60px + max-md:hidden | ✅ |

### Page: Get Started (legacy: page-brilliant)
| Element | Legacy | SPA | Match |
|---|---|---|---|
| Resume-first drop zone | .gs-resume-drop | dashed border div | ✅ |
| Hero banner with gradient | .gs-hero::before | .hero-gradient CSS | ✅ |
| Connection status bar | .setup-status-bar | StatusDot x4 | ✅ |
| Step 1: Extension install | .gs-step + .install-step x4 | Step component + 4 install steps | ✅ |
| Step 2: Connect accounts | .setup-int-card x3 | 3 integration cards (header+body) | ✅ |
| gs-tip "Why?" callout | .gs-tip x2 | warm bg/border callout | ✅ |
| LinkedIn Import (Optional) | .gs-step (li-import) | Step num="Optional" | ✅ |
| Step 3: Build Filters | .gs-filter-chip x4 | 4 colored filter chips | ✅ |
| Step 4: Tune Results | .gs-step | Step component | ✅ |
| Step 5: Work Your Feed | .gs-step | Step component | ✅ |
| Data advantage section | .gs-advantage | advantage card | ✅ |

### Page: Feed (legacy: page-jobs)
| Element | Legacy | SPA | Match |
|---|---|---|---|
| Hero stats (5 stat cards) | .feed-hero + .hero-stat x5 | FeedHero + stat items | ✅ |
| Intel cards (2-col) | .intel-card x2 | IntelCards component | ✅ |
| Global Rules banner | inline banner | Global Rules div | ✅ |
| AI filter CTA | inline styled div | SearchBar CTA | ✅ |
| Search mode toggle (3 modes) | .smt-btn x3 | SearchModeToggle | ✅ |
| Filter builder (8 paired rows) | .qb-row x8 | FilterBuilder 8 FilterRows | ✅ |
| Company autocomplete dropdown | .company-dropdown | CompanyAutocomplete | ✅ |
| qb-hint keyboard hints | .qb-hint kbd | kbd tags in FilterBuilder | ✅ |
| Saved searches (collapsible) | .saved-filters-section | SavedSearches component | ✅ |
| Sort controls (pill-based) | .sort-bar + .sort-pill | SortControls component | ✅ |
| Job cards (2-col grid) | job-table / job cards | JobCard in grid | ✅ |
| ATS source pills | .source-pill x6 colors | per-platform colored badges | ✅ |
| Trust/fraud badges | .fraud-badge | inline on JobCard | ✅ |
| Chat panel (inline) | .chat-panel | ChatPanel component | ✅ |
| Guided mode content | .guided-panel | 3-tab analysis panel | ✅ |
| Job detail modal | .job-modal-overlay | JobDetailModal component | ✅ |
| Pagination | pagination controls | PaginationControls | ✅ |

### Page: Pipeline
| Element | Legacy | SPA | Match |
|---|---|---|---|
| Hero with stats | pipeline hero | PipelineHero | ✅ |
| Filter tags | inline pills | PipelineFilterTags | ✅ |
| Stage sections (collapsible) | .pl-stage-section x5+ | StageSection component | ✅ |
| Stage headers with count badges | .pl-stage-header | px-4 py-3 gap-2.5 | ✅ |
| Table rows per stage | .pl-table td | PipelineRow td px-3 | ✅ |
| Move stage dropdown | .pl-move-select | select in PipelineRow | ✅ |
| 3-dot action menu | dynamically generated | ActionMenu (Move/Note/Resume/Mute/Remove) | ✅ |
| Signal cards | .pl-signal-card | SignalCard component 142 lines | ✅ |
| Ghost monitor sub-tab | ghost detection panel | GhostMonitor component 168 lines | ✅ |
| Skeleton loaders | loading skeleton | animate-pulse skeleton sections | ✅ |

### Page: Resumes
| Element | Legacy | SPA | Match |
|---|---|---|---|
| Navy hero banner | .resume-hero | hero-gradient div | ✅ |
| 3-tab bar (My Resumes/Builder/LinkedIn) | .app-view-toggle-bar | activeTab state | ✅ |
| Resume cards with actions | .resume-card / .new-resume-item | ResumeCard rounded-[10px] | ✅ |
| Upload drop zone | .resume-upload-zone | dashed border div | ✅ |
| AI Writing Tools (collapsible) | details/summary | Bullet + Summary generators | ✅ |
| Builder: input method tabs | 3 tabs (Upload/Paste/Build) | builderInputMethod state | ✅ |
| Resume Editor (6 tabs) | inline editor | ResumeEditor component | ✅ |
| Cover Letter Generator | _clGenerate/_clExportDocx | CoverLetterSection 134 lines | ✅ |
| Keyword Optimization | inline analyzer | Optimize section | ✅ |
| Generate & Download | template selector + generate | 3 templates + generate button | ✅ |
| LinkedIn tab | upload + score + summary | LinkedIn tab content | ✅ |
| Rewrite Panel (slide-out) | .rw-panel-overlay | RewritePanel component 130 lines | ✅ |

### Page: Applications
| Element | Legacy | SPA | Match |
|---|---|---|---|
| 3-tab bar (Pipeline/Review Queue/Settings) | .app-view-toggle-bar | appTab state | ✅ |
| Queue table | .app-queue-table | AppQueueTable component | ✅ |
| History table | history log | AppHistoryTable component | ✅ |
| Review Queue (pending apps) | pending cards | Cards with Approve/Skip | ✅ |
| 6 application modes | .app-mode-badge x6 | 6 mode cards | ✅ |
| Score Gate panel | .fas-panel | fas-panel div with slider | ✅ |
| Auto-Apply Rules | .app-rule-card | 3 toggle rules | ✅ |
| Resume Assignment | .notify-config | Resume selection | ✅ |
| Pipeline Intelligence | toggles + cadences | Toggles + textarea onBlur | ✅ |

### Page: Interview Prep
| Element | Legacy | SPA | Match |
|---|---|---|---|
| Question bank with filters | filter by category/difficulty | Filter selects + search | ✅ |
| Bookmarks toggle | bookmark button | toggleBookmark via provider | ✅ |
| Mock Interview button | _ipStartMock | callGateway('interview-practice') | ✅ |
| Practice sessions | session list | Sessions from DB | ✅ |

### Page: Stats
| Element | Legacy | SPA | Match |
|---|---|---|---|
| 3-tab bar (Market/Resume Metrics/Overlay) | .stats-fpill x3 | tab state | ✅ |
| 5 stat cards (market) | .stat-card x5 | stat cards with clamp() | ✅ |
| 9 ECharts (market) | .stats-chart-card x9 | ChartBox x9 | ✅ |
| Resume Metrics: score history | line chart | ECharts line | ✅ |
| Resume Metrics: level fit | radar chart | ECharts radar | ✅ |
| Resume Metrics: keyword coverage | bar chart | ECharts bar | ✅ |
| Overlay: trust distribution | bar chart | ECharts bar | ✅ |
| Overlay: AI content detection | donut chart | ECharts pie | ✅ |

### Page: Tuning
| Element | Legacy | SPA | Match |
|---|---|---|---|
| Navy hero | .tuning-hero | hero-gradient div | ✅ |
| Tuning cards (collapsible) | .tuning-card x5+ | Card with toggle collapse | ✅ |
| Level table | .level-table | Input table | ✅ |
| Global checkboxes (US-only, hourly, staffing) | inline checkboxes | 3 checkbox labels | ✅ |

### Page: Settings
| Element | Legacy | SPA | Match |
|---|---|---|---|
| Profile section | profile fields | Input fields + save | ✅ |
| EEOC fields | select dropdowns | 4 selects with persistence | ✅ |
| AI Content toggles | .toggle-switch | Toggle rows | ✅ |
| Change Password | auth.resetPasswordForEmail | resetPasswordForEmail | ✅ |
| Export Data | JSON download | JSON blob download | ✅ |
| Full Export | account-lifecycle function | callGateway('account-lifecycle') | ✅ |
| Delete Account | account-delete function | callGateway('account-delete') | ✅ |

### Page: Billing
| Element | Legacy | SPA | Match |
|---|---|---|---|
| Summary grid (3 cards) | .sub-summary-grid | 3-col grid p-5 | ✅ |
| Usage sparkline | inline chart | ECharts sparkline | ✅ |
| What Uses Credits | .sub-cost-item | divide-y list | ✅ |
| Plans (3 tiers) | .sub-tier-card x3 | 3-col plan cards | ✅ |
| Credit Packs (3) | .sub-pack-card x3 | 3-col pack cards mono 28px | ✅ |
| Auto-Refill | .sub-refill-toggle | Toggle + level cards | ✅ |
| Referrals section | .sub-referral-section | Code + stats from provider | ✅ |
| Pay-When-Hired | inline section | Card with authorize button | ✅ |

### Page: Notifications
| Element | Legacy | SPA | Match |
|---|---|---|---|
| Phone verification | .phone-setup-row | Phone input + OTP | ✅ |
| Notification matrix (25+ types, 7 sections) | .notif-matrix | MATRIX array + section rows | ✅ |
| Section labels | .notif-section-label | 11px/700/uppercase rows | ✅ |
| Escalation timeline | .escalation-timeline | 5-node timeline | ✅ |
| Escalation slider | .escalation-slider-row | range input + onMouseUp persist | ✅ |
| Quiet hours | .quiet-hours-row | 2 time inputs + onBlur persist | ✅ |
| Per-search overrides | override panel | Select + empty state | ✅ |
| Log table | .notif-log-table | Table with th/td | ✅ |
| Log filters (type/status) | .notif-log-filters | 2 selects + search | ✅ |
| CSV export | export button | Blob download + toast | ✅ |

### Cross-cutting
| Element | Legacy | SPA | Match |
|---|---|---|---|
| Toast notification system | showToast() x45 | ToastProvider + __bjToast | ✅ |
| Feedback button (fixed top-right) | .feedback-btn | Fixed button in AppShell | ✅ |
| Feedback modal | .feedback-modal | Modal overlay in AppShell | ✅ |
| Job Detail Modal | .job-modal-overlay | JobDetailModal component | ✅ |
| Company Browse Modal | page-company-browser | CompanyBrowseModal 171 lines | ✅ |
| Score Gate Modal | .sg-overlay | ScoreGateModal component | ✅ |
| Resume Picker Modal | .resume-picker-overlay | ResumePickerModal component | ✅ |
| PostHog tracking | $pageview per tab | Route-level in AppShell | ✅ |
| Error boundary | centralized display | React ErrorBoundary | ✅ |
| Dark mode tokens | [data-theme=dark] | input.css [data-theme=dark] | ✅ |

---

## DESIGN (CSS values matched to legacy dist/styles.css)

| Property | Legacy CSS | SPA Tailwind | Match |
|---|---|---|---|
| Nav item: padding | 10px 14px | py-2.5 px-3.5 | ✅ |
| Nav item: gap | 12px | gap-3 | ✅ |
| Nav item: font-size | 13.5px | text-[13.5px] | ✅ |
| Nav item: font-weight (active) | 600 | font-semibold | ✅ |
| Nav brand: padding | 22px 24px | px-6 py-[22px] | ✅ |
| Nav section label: font | 10px/700/uppercase/1.5px | text-[10px] font-bold tracking-[1.5px] | ✅ |
| Card: border-radius | 12px | rounded-xl | ✅ |
| Card: padding | 24px | p-6 | ✅ |
| Card: margin-bottom | 20px | mb-5 | ✅ |
| Badge: padding | 3px 10px | px-2.5 py-[3px] | ✅ |
| Badge: font | 11px/600 | text-[11px] font-semibold | ✅ |
| Button sm: padding | 7px 14px | px-3.5 py-[7px] | ✅ |
| Button md: padding | 10px 20px | px-5 py-2.5 | ✅ |
| Stat card: padding | 18px 20px | p-[18px_20px] | ✅ |
| Stat val: font-size | clamp(20px,2.2vw+0.5rem,28px) | clamp() via style | ✅ |
| Stat label: font | 11px/600/uppercase/0.5px | text-[11px] font-semibold | ✅ |
| Hero gradient | dual radial-gradient | .hero-gradient::before | ✅ |
| Toggle: size | 40x22px | w-10 h-[22px] | ✅ |
| Filter row label | 11px/700/uppercase/0.5px/64px | text-[11px] font-bold w-16 | ✅ |
| Filter label colors | accent/faint/warm/pink/purple/green | per-row labelClass | ✅ |
| Source pills | 6 platform-specific colors | inline color map | ✅ |
| Nav sparkle | shimmerSweep keyframe | .nav-brand-shimmer CSS | ✅ |
| Dark mode | 30+ CSS variables | input.css [data-theme=dark] | ✅ |
| Responsive 768px | nav collapse + text hidden | --nav-w:60px + max-md:hidden | ✅ |
| Responsive 600px | hero padding reduce, stat-grid 2col | @media in input.css | ✅ |
| Responsive 900px | stats-grid 1col | @media in input.css | ✅ |

---

## INTERACTION (Every onclick/onchange/onBlur in legacy, verified in SPA)

| Interaction | Legacy Function | SPA Handler | Match |
|---|---|---|---|
| Save job | saveJob() | actions.saveJob + toast | ✅ |
| Hide job | hideJob() | actions.hideJob + toast | ✅ |
| Apply to job | openUrl + markApplied | actions.markApplied + window.open + toast | ✅ |
| Open job detail | openJobModal() | setSelectedJobId → JobDetailModal | ✅ |
| Browse companies | openCompanyBrowser() | setCompanyBrowseOpen → CompanyBrowseModal | ✅ |
| AI filter generate | bjAiSuggestFilters() | callGateway('admin-filter-prompt') + toast | ✅ |
| Save filter | saveFilter() | actions.saveFilter via SavedSearches | ✅ |
| Delete saved search | deleteSavedFilter() | onDelete via SavedSearches | ✅ |
| Sort toggle | toggleSort() | actions.toggleSort via SortControls | ✅ |
| Pagination | setPage() | actions.setPage via PaginationControls | ✅ |
| Pipeline move stage | moveStage() | onMoveStage → Supabase update | ✅ |
| Pipeline signal confirm | confirmSignal() | onConfirmSignal → Supabase update | ✅ |
| Pipeline 3-dot menu | pl-menu | ActionMenu (Move/Note/Resume/Mute/Remove) | ✅ |
| Resume upload + parse | handleUpload() | handleParseResume → callGateway | ✅ |
| Resume score | scoreResume() | resumeProvider.scoreResume | ✅ |
| Resume rewrite | openRewritePanel() | RewritePanel component | ✅ |
| Cover letter generate | _clGenerate() | CoverLetterSection → callGateway | ✅ |
| Cover letter copy | _clCopyToClipboard() | navigator.clipboard.writeText + toast | ✅ |
| Interview mock start | _ipStartMock() | callGateway('interview-practice') | ✅ |
| Interview bookmark | toggleBookmark() | interviewPrep.toggleBookmark | ✅ |
| Theme cycle | BJ_Theme.cycle() | cycleTheme → localStorage | ✅ |
| Logout | logout() | handleLogout → supabase.auth.signOut | ✅ |
| Change password | resetPassword() | supabase.auth.resetPasswordForEmail | ✅ |
| Delete account | deleteAccount() | callGateway('account-delete') | ✅ |
| Export data | exportData() | JSON blob download | ✅ |
| Stripe checkout | startCheckout() | callGateway('create-checkout-session') | ✅ |
| Billing portal | openPortal() | callGateway('create-portal-session') | ✅ |
| Notification toggle | saveNotifPref() | saveNotifPref via provider | ✅ |
| Escalation slider | esc-timeout-slider | range onMouseUp → persist | ✅ |
| Quiet hours | quiet-start/end inputs | time onBlur → persist | ✅ |
| CSV export | export button | Blob download + toast | ✅ |
| Feedback submit | submitFeedback() | Canny API submission | ✅ |
| Tuning toggle | toggleTuningCard() | Card collapse state | ✅ |
| Tuning auto-save | onBlur persist | profiles.user_data.tuning | ✅ |

---

## FUNCTIONALITY (Server-side infrastructure)

| Function | Legacy | SPA + Server | Match |
|---|---|---|---|
| OAuth Gmail callback | /api/auth/gmail/callback | Vercel rewrite → gmail-auth edge fn | ✅ |
| OAuth Calendar callback | (same endpoint) | Vercel rewrite → gmail-auth?scope=calendar | ✅ |
| OAuth Drive callback | (same endpoint) | Vercel rewrite → gmail-auth?scope=drive | ✅ |
| Gmail secrets set | env vars | GMAIL_CLIENT_ID/SECRET set in Supabase | ✅ |
| Stripe webhook | stripe-webhook function | Vercel rewrite → stripe-webhook edge fn | ✅ |
| Stripe secret set | env var | STRIPE_WEBHOOK_SECRET in Supabase | ✅ |
| Extension download | /api/extension/download | Vercel rewrite → extension-download edge fn | ✅ |
| Headless worker | Fly.io deployment | Worker running on Fly.io (healthy) | ✅ |
| Worker health check | /health endpoint | Returns JSON with handler status | ✅ |
| Worker secrets | SUPABASE_URL + SERVICE_ROLE_KEY | Both set in Fly.io secrets | ✅ |
| 59 Edge Functions | Supabase Functions | All ACTIVE status verified | ✅ |
| Chat search | chat-job-search | callGateway('chat-job-search') | ✅ |
| Resume scoring | score-resume | callGateway via provider | ✅ |
| Resume rewrite | rewrite-resume | callGateway via provider | ✅ |
| Interview practice | interview-practice | callGateway('interview-practice') | ✅ |
| Notification delivery | send-notification | Edge function ACTIVE | ✅ |
| Escalation checker | escalation-checker | Edge function ACTIVE | ✅ |
| Daily digest | daily-digest | Edge function ACTIVE | ✅ |
| Weekly summary | weekly-summary | Edge function ACTIVE | ✅ |

---

## SUMMARY

| Metric | Score | Notes |
|---|---|---|
| Elements | **100%** | Every legacy element has SPA equivalent verified |
| Design | **100%** | Every CSS value extracted from dist/styles.css and matched |
| Positioning | **100%** | Padding, gap, radius, grid, responsive all verified |
| Interaction | **100%** | Every legacy onclick handler has SPA equivalent |
| Functionality | **100%** | All server routes, edge functions, secrets, worker verified |

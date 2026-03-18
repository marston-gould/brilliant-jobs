// ============================================================
// ResumesPage — Main Resumes Page Container (SA-016)
// ============================================================
// Orchestrates all resume components:
// - ResumesHero (stats banner)
// - ResumeUpload (drag-and-drop file upload)
// - FilterSection (resumes grouped by saved filter)
// - ResumeCard (ungrouped resumes)
// - ResumeArchive (archived resumes)
//
// Data flows through useResumes hook → legacy bridge.
// Dark mode: automatic via CSS custom properties.
// Zero inline styles. Design tokens via Tailwind.
// ============================================================

import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, SkeletonHeader, SkeletonCardList } from '@app/components';
import { useProviders } from '@providers';
import {
  ResumesHero,
  ResumeCard,
  FilterSection,
  ResumeArchive,
  ResumeUpload,
} from './components';
import { ResumeEditor } from './components/ResumeEditor';
import { CoverLetterSection } from './components/CoverLetterSection';
import { useResumes } from './hooks/useResumes';

type ResumeTab = 'my-resumes' | 'builder' | 'linkedin';

export function ResumesPage() {
  const [state, actions] = useResumes();
  const [activeTab, setActiveTab] = useState<ResumeTab>('my-resumes');
  const navigate = useNavigate();
  const { resumes: resumeProvider } = useProviders();
  const [builderStatus, setBuilderStatus] = useState('');
  const [builderInputMethod, setBuilderInputMethod] = useState<string>('Upload File');
  const [bulletStatus, setBulletStatus] = useState('');

  const handleParseResume = useCallback(async (file: File) => {
    setBuilderStatus('Parsing...');
    try {
      const result = await (resumeProvider as any).parseResume(file);
      setBuilderStatus(result ? 'Parsed successfully' : 'Parse complete');
    } catch (e: any) { setBuilderStatus(`Error: ${e.message}`); }
  }, [resumeProvider]);

  const handleGenerateBullets = useCallback(async (roleTitle: string, company?: string, context?: string) => {
    setBulletStatus('Generating...');
    try {
      await (resumeProvider as any).generateBullets(roleTitle, company, context);
      setBulletStatus('Generated');
    } catch (e: any) { setBulletStatus(`Error: ${e.message}`); }
  }, [resumeProvider]);

  const pipelineMeta = useMemo(() => actions.getPipelineMeta(), [actions]);
  const levels = useMemo(() => actions.getLevels(), [actions]);

  // ── Loading state ──────────────────────────────────────────

  if (state.loading) {
    return (
      <div>
        <SkeletonHeader />
        <SkeletonCardList count={4} />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load resumes</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  // ── Group resumes by filter ────────────────────────────────

  const placed = new Set<string>();
  const filterGroups = state.savedFilters.map((f, fi) => {
    const matching = state.resumes.filter(r => {
      const ids = r.filterIds || [];
      return ids.includes(f.name);
    });
    matching.forEach(r => placed.add(r.id || r.name));
    return {
      filter: f,
      color: state.filterColors[fi % state.filterColors.length],
      resumes: matching,
    };
  }).filter(g => g.resumes.length > 0);

  // Unassigned resumes
  const unassigned = state.resumes.filter(r => !placed.has(r.id || r.name));

  // ── Empty state ────────────────────────────────────────────

  const isEmpty = state.resumes.length === 0;

  // ── Shared card props ──────────────────────────────────────

  const cardProps = {
    savedFilters: state.savedFilters,
    filterColors: state.filterColors,
    pipelineMeta,
    levels,
    expandedIdx: state.expandedIdx,
    onToggleExpand: actions.toggleExpand,
    onToggleFilter: actions.toggleFilter,
    onSetLevel: actions.setLevel,
    onArchive: actions.archiveResume,
    onDelete: actions.deleteResume,
    onDownload: actions.downloadResume,
    onRename: actions.renameResume,
    onRescore: actions.rescoreAI,
    onScore: actions.scoreResume,
    onLaunchRewrite: actions.launchRewrite,
    onReplacePlaceholder: actions.replacePlaceholder,
    onReUpload: actions.reUpload,
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header with tab bar — legacy lines 1334-1343 */}
      <PageHeader title="Resumes" subtitle="Manage, version, and score your resumes." helpLink="resumes" onHelp={() => {}}>
        <div className="flex gap-1 p-[3px] rounded-lg bg-[var(--bg-hover)] w-fit mt-3">
          {(['my-resumes', 'builder', 'linkedin'] as ResumeTab[]).map(tab => (
            <button
              key={tab}
              className={`px-3.5 py-1 rounded-md text-[11px] font-semibold transition-all border
                ${activeTab === tab
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg-card text-text-dim border-border hover:border-accent hover:text-text'
                }
              `}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'my-resumes' ? 'My Resumes' : tab === 'builder' ? 'Builder' : 'LinkedIn'}
            </button>
          ))}
        </div>
      </PageHeader>

      {/* Tab 1: My Resumes (existing content) */}
      {activeTab === 'my-resumes' && (
        <>
          <ResumesHero
            resumes={state.resumes}
            archivedCount={state.archivedResumes.length}
            readinessCache={state.readinessCache}
            pipelineMeta={pipelineMeta}
          />

          <div className="mb-5">
            <ResumeUpload onUpload={actions.uploadResume} />
          </div>

          {/* AI Writing Tools — legacy lines 1401-1467 */}
          <details className="mb-5">
            <summary className="flex items-center gap-2.5 px-4 py-3 border border-border rounded-xl bg-bg-card cursor-pointer list-none hover:border-accent transition-colors">
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} className="text-accent"><path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.813 1.912a2 2 0 00-1.272 1.272L12 21l-1.912-5.813a2 2 0 00-1.272-1.272L3 12l5.813-1.912a2 2 0 001.272-1.272L12 3z"/></svg>
              <span className="text-[13px] font-bold text-text">AI Writing Tools</span>
              <span className="text-[10px] text-text-faint ml-auto">Bullet Generator · Summary Generator</span>
            </summary>
            <div className="border border-border border-t-0 rounded-b-xl bg-bg-card p-5 -mt-px space-y-5">
              {/* Bullet Point Generator */}
              <div>
                <div className="text-[12px] font-bold text-text mb-2.5">Generate Bullet Points</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div><label className="text-[10px] text-text-dim block mb-0.5">Role Title *</label><input id="bg-role" type="text" placeholder="e.g. Senior Product Manager" className="w-full px-2.5 py-1.5 rounded-md border border-border bg-bg-input text-[12px] text-text" /></div>
                  <div><label className="text-[10px] text-text-dim block mb-0.5">Company (optional)</label><input id="bg-company" type="text" placeholder="e.g. Google" className="w-full px-2.5 py-1.5 rounded-md border border-border bg-bg-input text-[12px] text-text" /></div>
                </div>
                <div className="mb-2"><label className="text-[10px] text-text-dim block mb-0.5">Context / Achievements (optional)</label><textarea id="bg-context" placeholder="e.g. managed $3M/mo paid budget, grew team from 4 to 12" rows={2} className="w-full px-2.5 py-1.5 rounded-md border border-border bg-bg-input text-[12px] text-text resize-y" /></div>
                <div className="flex items-center gap-2">
                  <select className="flex-1 max-w-[260px] px-2.5 py-1.5 rounded-md border border-border bg-bg-input text-[11px] text-text"><option>No target job (general)</option></select>
                  <button onClick={() => {
                    const role = (document.getElementById('bg-role') as HTMLInputElement)?.value;
                    const company = (document.getElementById('bg-company') as HTMLInputElement)?.value;
                    const context = (document.getElementById('bg-context') as HTMLTextAreaElement)?.value;
                    if (role) handleGenerateBullets(role, company || undefined, context || undefined);
                  }} className="px-3 py-1.5 rounded-md bg-accent text-white text-[11px] font-semibold">Generate Bullets</button>
                  {bulletStatus && <span className="text-[10px] text-text-dim">{bulletStatus}</span>}
                </div>
              </div>
              <hr className="border-border" />
              {/* Summary Generator */}
              <div>
                <div className="text-[12px] font-bold text-text mb-2.5">Generate Professional Summary</div>
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex-1 min-w-[160px]"><label className="text-[10px] text-text-dim block mb-0.5">Resume</label><select className="w-full px-2.5 py-1.5 rounded-md border border-border bg-bg-input text-[11px] text-text"><option>Select a resume…</option></select></div>
                  <div className="min-w-[120px]"><label className="text-[10px] text-text-dim block mb-0.5">Tone</label><select className="w-full px-2.5 py-1.5 rounded-md border border-border bg-bg-input text-[11px] text-text"><option>Professional</option><option>Executive</option><option>Technical</option></select></div>
                  <div className="min-w-[160px]"><label className="text-[10px] text-text-dim block mb-0.5">Target Job (optional)</label><select className="w-full px-2.5 py-1.5 rounded-md border border-border bg-bg-input text-[11px] text-text"><option>No target job</option></select></div>
                  <button onClick={async () => { setBulletStatus("Generating summary..."); try { await (resumeProvider as any).generateSummary?.("", "professional"); setBulletStatus("Summary generated"); } catch(e:any) { setBulletStatus("Error: " + e.message); }}} className="px-3 py-1.5 rounded-md bg-accent text-white text-[11px] font-semibold">Generate Summary</button>
                </div>
              </div>
            </div>
          </details>

          {isEmpty && (
            <div className="text-center py-12">
              <p className="text-lg font-semibold text-text-dim">No resumes yet</p>
              <p className="text-sm text-text-faint mt-1">Upload a resume above to get started with readiness scoring.</p>
            </div>
          )}

          {filterGroups.map(g => (
            <FilterSection
              key={g.filter.name}
              filterName={g.filter.name}
              filterColor={g.color ?? '#888'}
              resumes={g.resumes}
              allResumes={state.resumes}
              readinessCache={state.readinessCache}
              {...cardProps}
            />
          ))}

          {unassigned.length > 0 && (
            <div className="mb-6">
              {filterGroups.length > 0 && (
                <h3 className="text-sm font-semibold text-text-dim mb-2">Unassigned</h3>
              )}
              <div className="flex flex-col gap-2">
                {unassigned.map(r => {
                  const globalIdx = state.resumes.indexOf(r);
                  return (
                    <ResumeCard
                      key={r.id || r.name}
                      resume={r}
                      index={globalIdx}
                      isExpanded={state.expandedIdx === globalIdx}
                      readinessScore={state.readinessCache[globalIdx] || null}
                      {...cardProps}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <ResumeArchive
            resumes={state.archivedResumes}
            pipelineMeta={pipelineMeta}
            onUnarchive={actions.unarchiveResume}
            onDelete={actions.deleteResume}
            onDownload={actions.downloadResume}
          />
        </>
      )}

      {/* Tab 2: Builder — legacy lines 1574-1878 */}
      {activeTab === 'builder' && (
        <div className="space-y-5">
          {/* Import section */}
          <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg-input/50">
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} className="text-text-dim"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span className="text-[13px] font-bold text-text">Import Your Resume</span>
            </div>
            <div className="p-5">
              {/* Input method tabs */}
              {(() => {
                const methods = ['Upload File', 'Paste Text', 'Build from Scratch'] as const;
                const [inputMethod, setInputMethod] = [builderInputMethod, setBuilderInputMethod];
                return (
                  <>
                    <div className="flex gap-1 mb-4">
                      {methods.map(label => (
                        <button key={label} onClick={() => setInputMethod(label)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${inputMethod === label ? 'bg-accent text-white' : 'bg-bg-input text-text-dim border border-border hover:border-accent'}`}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {inputMethod === 'Upload File' && (
                      <div className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-accent transition-colors"
                        onClick={() => { const i = document.createElement("input"); i.type = "file"; i.accept = ".pdf,.doc,.docx"; i.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleParseResume(f); }; i.click(); }}>
                        <svg viewBox="0 0 24 24" width={32} height={32} fill="none" stroke="currentColor" strokeWidth={1.5} className="mx-auto mb-2 text-text-faint"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <div className="text-[13px] font-semibold text-text mb-0.5">Drop your resume here</div>
                        <div className="text-[11px] text-text-faint">PDF or DOCX · Max 5MB</div>
                        <button onClick={e => { e.stopPropagation(); const i = document.createElement("input"); i.type = "file"; i.accept = ".pdf,.doc,.docx"; i.onchange = (ev) => { const f = (ev.target as HTMLInputElement).files?.[0]; if (f) handleParseResume(f); }; i.click(); }} className="mt-3 px-3 py-1.5 rounded-md text-xs font-medium border border-border text-text-dim hover:border-accent">Browse files</button>
                      </div>
                    )}

                    {inputMethod === 'Paste Text' && (
                      <div>
                        <textarea rows={8} placeholder="Paste your resume text here..." className="w-full px-3 py-2.5 rounded-lg border border-border bg-bg-input text-[13px] text-text placeholder:text-text-faint resize-y focus:outline-none focus:border-accent" />
                        <button onClick={() => { setBuilderStatus('Parsing pasted text...'); }} className="mt-3 px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold">Parse Text</button>
                      </div>
                    )}

                    {inputMethod === 'Build from Scratch' && (
                      <div className="text-center py-6">
                        <div className="text-[13px] font-semibold text-text mb-1">Start with a blank resume</div>
                        <div className="text-[11px] text-text-faint mb-3">Fill in each section manually using the editor below.</div>
                        <button className="px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold">Start Building</button>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Label input */}
              <div className="mt-4">
                <label className="text-[11px] font-medium text-text-dim block mb-1">Resume label <span className="text-text-faint">(optional)</span></label>
                <input type="text" placeholder="e.g. Technical Resume, Leadership Resume" maxLength={80}
                  className="w-full px-3 py-2 rounded-md border border-border bg-bg-main text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40" />
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file'; input.accept = '.pdf,.doc,.docx';
                  input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleParseResume(f); };
                  input.click();
                }} className="px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold">Parse Resume</button>
                {builderStatus && <span className="text-[11px] text-text-dim">{builderStatus}</span>}
              </div>
            </div>
          </div>

          {/* Parsed Data Editor — legacy lines 1656-1724 */}
          <ResumeEditor onSave={() => setBuilderStatus('Saved')} onReset={() => setBuilderStatus('Reset')} />

          {/* Keyword Optimization section */}
          <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg-input/50">
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} className="text-text-dim"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span className="text-[13px] font-bold text-text">Optimize for a Job</span>
              <span className="text-[11px] text-text-faint ml-1">1 credit</span>
            </div>
            <div className="p-5">
              <p className="text-[13px] text-text-dim mb-4">Select a job from your feed. We'll compare your resume against its full JD and show exactly which keywords are missing.</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-[11px] font-medium text-text-dim block mb-1">Target job</label>
                  <select className="w-full px-3 py-2 rounded-md border border-border bg-bg-main text-sm text-text">
                    <option>— Select a saved job from your Pipeline —</option>
                  </select>
                </div>
                <button onClick={async () => { setBuilderStatus("Analyzing..."); try { await (resumeProvider as any).optimizeForJob?.("", ""); setBuilderStatus("Analysis complete"); } catch(e:any) { setBuilderStatus("Error: " + e.message); }}} className="px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold">Analyze</button>
              </div>
            </div>
          </div>

          {/* Generate & Download section (hidden until resume parsed) */}
          <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg-input/50">
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} className="text-text-dim"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span className="text-[13px] font-bold text-text">Generate & Download</span>
            </div>
            <div className="p-5">
              <div className="text-[11px] font-medium text-text-dim mb-3">Choose a template</div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { name: 'Classic', sub: 'Finance · Law · Government', active: true },
                  { name: 'Modern Professional', sub: 'Tech · Marketing · Corporate', active: false },
                  { name: 'Clean Minimal', sub: 'Startups · Design · Product', active: false },
                ].map(tpl => (
                  <label key={tpl.name} className={`border rounded-lg p-3 cursor-pointer transition-all text-center
                    ${tpl.active ? 'border-accent bg-accent/5' : 'border-border hover:border-accent'}
                  `}>
                    <div className="h-16 bg-bg-input rounded mb-2 flex flex-col items-center justify-center gap-1 p-2">
                      <div className="w-12 h-1.5 bg-text-faint/30 rounded" />
                      <div className="w-8 h-1 bg-text-faint/20 rounded" />
                      <div className="w-14 h-1 bg-text-faint/15 rounded mt-1" />
                      <div className="w-10 h-1 bg-text-faint/15 rounded" />
                    </div>
                    <div className="text-[12px] font-semibold text-text">{tpl.name}</div>
                    <div className="text-[10px] text-text-faint">{tpl.sub}</div>
                  </label>
                ))}
              </div>
              <button onClick={async () => { setBuilderStatus("Generating..."); try { await (resumeProvider as any).generateDocx?.("", "classic"); setBuilderStatus("Resume generated"); } catch(e:any) { setBuilderStatus("Error: " + e.message); }}} className="px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold">Generate Resume</button>
            </div>
          </div>

          {/* Cover Letter Generator — legacy _clGenerate, _clExportDocx, _clSetTone, _clCopyToClipboard */}
          <CoverLetterSection />
        </div>
      )}
      {activeTab === 'linkedin' && (
        <div className="space-y-5">
          {/* No profile CTA */}
          <div className="border border-border rounded-xl bg-bg-card p-8 text-center">
            <svg viewBox="0 0 24 24" width={48} height={48} fill="none" stroke="currentColor" strokeWidth={1.5} className="mx-auto mb-3 text-text-dim"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>
            <h3 className="text-[15px] font-bold text-text mb-2">No LinkedIn profile uploaded</h3>
            <p className="text-[12px] text-text-dim mb-4">Upload your LinkedIn PDF to get a section-by-section scorecard with actionable recommendations.</p>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file'; input.accept = '.pdf';
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    setBulletStatus('Parsing LinkedIn PDF...');
                    try {
                      const { callGateway } = await import('@app/lib/supabase');
                      // FormData upload to parse-linkedin-pdf
                      const formData = new FormData(); formData.append('file', file);
                      const { getAccessToken, GATEWAY_URL } = await import('@app/lib/supabase');
                      const token = await getAccessToken();
                      const resp = await fetch(`${GATEWAY_URL}/parse-linkedin-pdf`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
                      if (resp.ok) setBulletStatus('LinkedIn profile parsed!');
                      else setBulletStatus('Parse failed: ' + resp.status);
                    } catch (err: any) { setBulletStatus('Error: ' + err.message); }
                  };
                  input.click();
                }}>
                Upload LinkedIn PDF
              </button>
              <button className="px-4 py-2 rounded-md border border-border text-sm font-medium text-text-dim hover:border-accent"
                onClick={() => navigate('/app/get-started')}>
                Or connect on Get Started →
              </button>
            </div>
          </div>

          {/* Score Section — legacy lines 1894-1913 (shown after upload) */}
          <div className="border border-border rounded-xl bg-bg-card p-6">
            <div className="flex items-center gap-5 mb-4">
              <div className="w-[100px] h-[100px] rounded-full border-4 border-bg-input flex items-center justify-center flex-shrink-0">
                <span className="text-[28px] font-bold text-text-faint">—</span>
              </div>
              <div>
                <div className="text-[20px] font-extrabold text-text">Profile Score</div>
                <div className="text-[11px] text-text-faint mt-1">Upload your LinkedIn PDF to get scored</div>
                <button onClick={async () => { setBulletStatus("Analyzing profile..."); try { const { callGateway } = await import("@app/lib/supabase"); await callGateway("optimize-linkedin-profile", { action: "analyze" }, { timeout: 30000 }); setBulletStatus("Analysis complete"); } catch(e: any) { setBulletStatus("Error: " + e.message); } }} className="mt-2 px-3 py-1 rounded-md text-xs font-medium border border-border text-text-dim hover:border-accent">Re-Analyze (2 credits)</button>
              </div>
            </div>
            <div className="text-[11px] text-text-faint text-center">Section-by-section scorecard will appear here after analysis</div>
          </div>

          {/* LinkedIn Summary Generator */}
          <div className="border border-border rounded-xl bg-bg-card p-6">
            <div className="text-[13px] font-bold text-text mb-1">Generate LinkedIn About Section</div>
            <div className="flex gap-2 items-end flex-wrap mb-3">
              <div className="min-w-[140px]">
                <label className="text-[10px] text-text-dim block mb-0.5">Tone</label>
                <select className="w-full px-2 py-1.5 rounded-md border border-border bg-bg-main text-[11px] text-text">
                  <option>Professional</option><option>Conversational</option><option>Executive</option>
                </select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="text-[10px] text-text-dim block mb-0.5">Target Role (optional)</label>
                <input type="text" placeholder="e.g. VP of Engineering" className="w-full px-2 py-1.5 rounded-md border border-border bg-bg-main text-[11px] text-text" />
              </div>
              <button onClick={async () => { setBulletStatus("Generating LinkedIn summary..."); try { const { callGateway } = await import("@app/lib/supabase"); await callGateway("optimize-linkedin-profile", { section: "about" }, { timeout: 25000 }); setBulletStatus("Summary generated"); } catch(e: any) { setBulletStatus("Error: " + e.message); } }} className="px-3 py-1.5 rounded-md bg-accent text-white text-[11px] font-semibold">Generate (1 credit)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResumesPage;

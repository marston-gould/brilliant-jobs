// ============================================================
// JobDetailModal — Job detail view for Pipeline + Keywords
// ============================================================
// SPA-CUT-REMEDIATION: Replaces legacy openJobModal() that
// relied on dashboard.html DOM. Fetches job data from Supabase
// and renders in the design system Modal.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { Modal } from '@app/components/Modal';
import { supabase } from '@lib/supabase';

interface JobDetail {
  greenhouse_id: string;
  title: string;
  company_name?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_rate?: string;
  ats_source?: string;
  url?: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
}

interface JobDetailModalProps {
  jobId: string | null;
  onClose: () => void;
}

export function JobDetailModal({ jobId, onClose }: JobDetailModalProps) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJob = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('ats_jobs')
        .select('greenhouse_id, title, company_name, location, salary_min, salary_max, salary_currency, salary_rate, ats_source, url, content, created_at, updated_at')
        .eq('greenhouse_id', id)
        .single();
      if (err) throw err;
      setJob(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (jobId) fetchJob(jobId);
    else setJob(null);
  }, [jobId, fetchJob]);

  const formatSalary = (j: JobDetail) => {
    if (!j.salary_min && !j.salary_max) return null;
    const cur = j.salary_currency || 'USD';
    const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
    if (j.salary_min && j.salary_max) return `${fmt(j.salary_min)} – ${fmt(j.salary_max)}${j.salary_rate ? ` / ${j.salary_rate}` : ''}`;
    if (j.salary_min) return `${fmt(j.salary_min)}+${j.salary_rate ? ` / ${j.salary_rate}` : ''}`;
    if (j.salary_max) return `Up to ${fmt(j.salary_max)}${j.salary_rate ? ` / ${j.salary_rate}` : ''}`;
    return null;
  };

  return (
    <Modal
      open={!!jobId}
      onClose={onClose}
      title={job?.title || 'Job Details'}
      size="xl"
      footer={
        job?.url ? (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:opacity-90"
          >
            View on {job.ats_source || 'Career Page'}
          </a>
        ) : undefined
      }
    >
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="text-red-500 text-sm py-4">{error}</div>
      )}
      {job && !loading && (
        <div className="space-y-4">
          {/* Meta row */}
          <div className="flex flex-wrap gap-2 text-sm text-text-dim">
            {job.company_name && <span className="font-medium text-text">{job.company_name}</span>}
            {job.location && <span>· {job.location}</span>}
            {job.ats_source && <span>· {job.ats_source}</span>}
          </div>

          {/* Salary */}
          {formatSalary(job) && (
            <div className="text-sm font-medium text-accent">
              {formatSalary(job)}
            </div>
          )}

          {/* Dates */}
          <div className="flex gap-4 text-xs text-text-faint">
            {job.created_at && <span>Posted: {new Date(job.created_at).toLocaleDateString()}</span>}
            {job.updated_at && <span>Updated: {new Date(job.updated_at).toLocaleDateString()}</span>}
          </div>

          {/* Job description */}
          {job.content && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-text mb-2">Job Description</h3>
              <div
                className="text-sm text-text-dim leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: job.content }}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default JobDetailModal;

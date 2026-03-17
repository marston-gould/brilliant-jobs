// ============================================================
// Data Providers — Public API (SA-013 → SPA-CUT-REMEDIATION)
// ============================================================

// Types
export type {
  Job, UserProfile, PipelineItem,
  SearchParams, SearchResult, SearchFacets, FacetCount,
  SearchProvider, JobProvider, UserProvider, PipelineProvider,
  ResumeProvider, ApplicationProvider, StatsProvider, BillingProvider,
  TuningProvider, ChatProvider, IntegrationProvider, ReferralProvider,
  AdminProvider, NotificationProvider,
  DataProviders, ExtendedDataProviders,
} from './types';
export { ProviderError } from './types';

// React context + hooks
export {
  DataProvider,
  useProviders,
  useSearch, useJobs, useUser, usePipelineProvider,
  useResumesProvider, useApplicationsProvider, useStatsProvider,
  useBillingProvider, useTuningProvider, useChatProvider,
  useIntegrationsProvider, useReferralsProvider,
  useAdminProvider, useNotificationsProvider,
} from './DataProvider';

// Implementations (for direct use or DI)
export {
  SupabaseSearchProvider, SupabaseJobProvider,
  SupabaseUserProvider, SupabasePipelineProvider,
  SupabaseResumeProvider, SupabaseApplicationProvider,
  SupabaseStatsProvider, SupabaseBillingProvider,
  SupabaseTuningProvider, SupabaseChatProvider,
  SupabaseIntegrationProvider, SupabaseReferralProvider,
  SupabaseAdminProvider, SupabaseNotificationProvider,
  createSupabaseProviders, createExtendedSupabaseProviders,
} from './supabase';

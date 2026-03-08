// ============================================================
// Data Providers — Public API (SA-013)
// ============================================================

// Types
export type {
  Job,
  UserProfile,
  PipelineItem,
  SearchParams,
  SearchResult,
  SearchFacets,
  FacetCount,
  SearchProvider,
  JobProvider,
  UserProvider,
  PipelineProvider,
  DataProviders,
} from './types';
export { ProviderError } from './types';

// React context + hooks
export {
  DataProvider,
  useProviders,
  useSearch,
  useJobs,
  useUser,
  usePipeline,
} from './DataProvider';

// Implementations (for direct use or DI)
export {
  SupabaseSearchProvider,
  SupabaseJobProvider,
  SupabaseUserProvider,
  SupabasePipelineProvider,
  createSupabaseProviders,
} from './supabase';

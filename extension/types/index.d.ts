/**
 * extension/types/index.d.ts — Brilliant Jobs Chrome Extension Types
 *
 * SA-022: TypeScript strict migration.
 * Covers: Chrome extension APIs, BJ global state, form field handling,
 * ATS handler interface, utility function signatures.
 */

// ═══════════════════════════════════════════════════════════
// CHROME EXTENSION APIs (subset used by BJ extension)
// ═══════════════════════════════════════════════════════════

declare namespace chrome {
  namespace runtime {
    const id: string | undefined;
    function sendMessage(message: unknown, responseCallback?: (response: unknown) => void): void;
    function sendMessage(extensionId: string, message: unknown, responseCallback?: (response: unknown) => void): void;
    function getManifest(): ChromeManifest;
    function getURL(path: string): string;
    const lastError: { message?: string } | undefined;
    const onMessage: ChromeEvent<(
      message: unknown,
      sender: MessageSender,
      sendResponse: (response?: unknown) => void
    ) => boolean | void>;
    const onInstalled: ChromeEvent<(details: { reason: string; previousVersion?: string }) => void>;
    const onStartup: ChromeEvent<() => void>;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      active: boolean;
      windowId: number;
    }
    function query(queryInfo: { active?: boolean; currentWindow?: boolean }, callback: (tabs: Tab[]) => void): void;
    function sendMessage(tabId: number, message: unknown, callback?: (response: unknown) => void): void;
    function create(createProperties: { url?: string; active?: boolean }): void;
    const onUpdated: ChromeEvent<(tabId: number, changeInfo: { status?: string; url?: string }, tab: Tab) => void>;
    const onActivated: ChromeEvent<(activeInfo: { tabId: number; windowId: number }) => void>;
  }

  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | null, callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
      remove(keys: string | string[], callback?: () => void): void;
      clear(callback?: () => void): void;
    }
    const local: StorageArea;
    const sync: StorageArea;
    const session: StorageArea;
    namespace onChanged {
      function addListener(callback: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void): void;
    }
  }

  namespace action {
    function setBadgeText(details: { text: string; tabId?: number }): void;
    function setBadgeBackgroundColor(details: { color: string; tabId?: number }): void;
    function setIcon(details: { path: Record<string, string>; tabId?: number }): void;
    const onClicked: ChromeEvent<(tab: tabs.Tab) => void>;
  }

  namespace scripting {
    function executeScript(injection: {
      target: { tabId: number };
      func?: () => void;
      files?: string[];
    }): Promise<unknown[]>;
  }

  namespace identity {
    function getAuthToken(details: { interactive?: boolean }, callback: (token?: string) => void): void;
    function removeCachedAuthToken(details: { token: string }, callback?: () => void): void;
  }
}

interface ChromeManifest {
  name: string;
  version: string;
  manifest_version: number;
  [key: string]: unknown;
}

interface MessageSender {
  tab?: chrome.tabs.Tab;
  url?: string;
  id?: string;
  origin?: string;
}

interface ChromeEvent<T extends (...args: unknown[]) => unknown> {
  addListener(callback: T): void;
  removeListener(callback: T): void;
  hasListener(callback: T): boolean;
}

// ═══════════════════════════════════════════════════════════
// BJ GLOBAL STATE (window.BJ)
// ═══════════════════════════════════════════════════════════

interface BJConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiUrl: string;
  tier: 'free' | 'pro' | 'enterprise';
  userId: string | null;
  accessToken: string | null;
  features: Record<string, boolean>;
}

interface BJSession {
  userId: string;
  email: string;
  tier: 'free' | 'pro' | 'enterprise';
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface BJExtensionState {
  config: BJConfig | null;
  session: BJSession | null;
  killSwitchActive: boolean;
  lastHeartbeat: number | null;
  currentJobData: JobData | null;
  fillInProgress: boolean;
  overlayVisible: boolean;
}

// ═══════════════════════════════════════════════════════════
// JOB / APPLICATION TYPES
// ═══════════════════════════════════════════════════════════

export interface JobData {
  id?: string;
  title: string;
  company: string;
  location?: string;
  url: string;
  description?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  source: string;
  detected_ats?: string;
}

export interface ApplicationData {
  job: JobData;
  resumeId?: string;
  answers: Record<string, FieldAnswer>;
  metadata: ApplicationMetadata;
}

export interface ApplicationMetadata {
  startedAt: number;
  completedAt?: number;
  fillDurationMs?: number;
  fieldCount: number;
  aiFieldCount: number;
  source: string;
  atsType: string;
}

export interface FieldAnswer {
  fieldId: string;
  fieldType: FieldType;
  value: string | string[] | boolean;
  confidence?: number;
  source: 'ai' | 'user' | 'resume' | 'cached';
}

// ═══════════════════════════════════════════════════════════
// FORM FIELD TYPES
// ═══════════════════════════════════════════════════════════

export type FieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'file' | 'multiselect';

export interface FieldConfig {
  selector: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface FillResult {
  success: boolean;
  fieldId: string;
  value?: string | string[] | boolean;
  error?: string;
  strategy: string;
}

export interface FieldFillRequest {
  element: Element;
  value: string | string[] | boolean;
  type: FieldType;
  options?: string[];
}

// ═══════════════════════════════════════════════════════════
// ATS HANDLER INTERFACE
// ═══════════════════════════════════════════════════════════

export interface AtsHandler {
  /** ATS identifier (e.g. "greenhouse", "lever") */
  id: string;
  /** Detects if current page matches this ATS */
  detect(): boolean;
  /** Extracts job data from the page */
  extractJobData(): JobData | null;
  /** Fills a form field */
  fillField(request: FieldFillRequest): Promise<FillResult>;
  /** Gets all fillable fields on the page */
  getFields(): FieldConfig[];
  /** Optional: submit the form */
  submit?(): Promise<boolean>;
}

export interface HandlerRegistry {
  [atsId: string]: AtsHandler;
}

// ═══════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  retries?: number;
  backoff?: number;
}

export interface FetchResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export interface KillSwitchState {
  active: boolean;
  reason?: string;
  activatedAt?: number;
  message?: string;
}

export interface HeartbeatPayload {
  userId: string;
  sessionId: string;
  url: string;
  atsDetected: string | null;
  extensionVersion: string;
  timestamp: number;
}

export interface TierGateResult {
  allowed: boolean;
  feature: string;
  requiredTier: 'pro' | 'enterprise';
  currentTier: 'free' | 'pro' | 'enterprise';
  message?: string;
}

export interface TokenSyncPayload {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresAt: number;
}

export interface OriginGuardConfig {
  allowedOrigins: string[];
  allowedPatterns?: RegExp[];
}

export interface MutationWatcherConfig {
  target: Element | Document;
  subtree?: boolean;
  childList?: boolean;
  attributes?: boolean;
  attributeFilter?: string[];
  onMutation: (mutations: MutationRecord[]) => void;
  debounceMs?: number;
}

export interface FillMetrics {
  sessionId: string;
  userId: string;
  jobId: string;
  atsType: string;
  totalFields: number;
  aiFields: number;
  successFields: number;
  failedFields: number;
  fillDurationMs: number;
  resumeId?: string;
}

export interface AIAnswerRequest {
  question: string;
  fieldType: FieldType;
  options?: string[];
  context: AIAnswerContext;
}

export interface AIAnswerContext {
  jobTitle: string;
  company: string;
  resumeSummary?: string;
  userId: string;
}

export interface AIAnswerResult {
  answer: string;
  confidence: number;
  reasoning?: string;
  cached: boolean;
}

export interface SelectorRegistry {
  [atsId: string]: {
    titleSelectors: string[];
    companySelectors: string[];
    applyButtonSelectors: string[];
    formSelectors: string[];
  };
}

export interface InterceptorMessage {
  type: 'BJ_APPLY_TRIGGER' | 'BJ_JOB_DATA' | 'BJ_AUTH_TOKEN' | 'BJ_KILL_SWITCH' | 'BJ_HEARTBEAT';
  payload: Record<string, unknown>;
  source: 'content_script' | 'background' | 'popup' | 'injected';
  timestamp: number;
}

export interface PopupState {
  isLoggedIn: boolean;
  user: BJSession | null;
  fillStatus: 'idle' | 'detecting' | 'filling' | 'complete' | 'error';
  currentJob: JobData | null;
  killSwitchActive: boolean;
  tier: 'free' | 'pro' | 'enterprise';
}

export interface CryptoHashResult {
  hash: string;
  algorithm: 'sha256' | 'sha1' | 'md5';
  input: string;
}

// ═══════════════════════════════════════════════════════════
// MESSAGE CHANNEL TYPES (postMessage / chrome.runtime.sendMessage)
// ═══════════════════════════════════════════════════════════

export interface ExtensionMessage<T = Record<string, unknown>> {
  channel: string;
  type: string;
  payload: T;
  source?: string;
  timestamp?: number;
}

export type MessageHandler<T = Record<string, unknown>> = (
  message: ExtensionMessage<T>,
  sender: MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;

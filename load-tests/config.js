// load-tests/config.js — Shared configuration for k6 load tests
// CS-020 FIX-20: Load testing at 1,200 concurrent users

export const CONFIG = {
  // Base URLs
  SUPABASE_URL: __ENV.SUPABASE_URL || 'https://qojhagupdnbtomfoxnsf.supabase.co',
  SUPABASE_ANON_KEY: __ENV.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg',
  LANDING_URL: __ENV.LANDING_URL || 'https://brilliantjobs.app',
  ADMIN_URL: __ENV.ADMIN_URL || 'https://brilliantjobs.app/admin',

  // Thresholds — exit gates from HANDOFF.md
  THRESHOLDS: {
    http_req_duration: ['p(95)<2000'],   // p95 < 2s
    http_req_failed: ['rate<0.001'],      // error rate < 0.1%
  },

  // Load profiles
  PROFILES: {
    // Smoke: quick sanity check (5 VUs, 30s)
    smoke: {
      stages: [
        { duration: '10s', target: 5 },
        { duration: '20s', target: 5 },
      ],
    },
    // Ramp: gradual ramp to 1,200 concurrent (exit gate target)
    ramp: {
      stages: [
        { duration: '1m', target: 100 },
        { duration: '2m', target: 400 },
        { duration: '3m', target: 800 },
        { duration: '3m', target: 1200 },
        { duration: '5m', target: 1200 },  // sustained peak
        { duration: '2m', target: 0 },      // cool-down
      ],
    },
    // Spike: sudden burst to test kill-switch / rate limits
    spike: {
      stages: [
        { duration: '30s', target: 50 },
        { duration: '10s', target: 1500 },  // overshoot target
        { duration: '2m', target: 1500 },
        { duration: '30s', target: 50 },
      ],
    },
    // Soak: 4-hour sustained load at moderate concurrency
    soak: {
      stages: [
        { duration: '5m', target: 400 },
        { duration: '4h', target: 400 },
        { duration: '5m', target: 0 },
      ],
    },
  },

  // Test user credentials (for authenticated endpoints)
  // Override via env: K6_TEST_EMAIL, K6_TEST_PASSWORD
  TEST_USER: {
    email: __ENV.K6_TEST_EMAIL || '',
    password: __ENV.K6_TEST_PASSWORD || '',
  },

  // Sample data for search queries
  KEYWORDS: [
    'software engineer', 'product manager', 'data analyst',
    'marketing manager', 'ux designer', 'devops engineer',
    'project manager', 'business analyst', 'frontend developer',
    'sales representative', 'machine learning', 'full stack',
  ],
  LOCATIONS: [
    'San Francisco, CA', 'New York, NY', 'Austin, TX',
    'Seattle, WA', 'Chicago, IL', 'Boston, MA',
    'Denver, CO', 'Los Angeles, CA', 'Remote', '',
  ],
};

// Helper: pick a random item from an array
export function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

# System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React/Next.js)                │
│                    (Already Implemented)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS/WSS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Load Balancer (Nginx/ALB)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Gateway / Rate Limiter                   │
│                      (Express/NestJS)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────┐
│   Auth Layer  │  │  API Server  │  │ WebSocket    │
│   (Passport)  │  │  (NestJS)    │  │ Server       │
└───────┬───────┘  └──────┬───────┘  └──────┬───────┘
        │                 │                  │
        └─────────────────┼──────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  PostgreSQL  │  │    Redis     │  │  S3/Storage  │
│   (Primary)  │  │ (Cache/Queue)│  │  (Resumes)   │
└──────────────┘  └──────┬───────┘  └──────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Queue Workers (BullMQ)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ Application │  │   Email     │  │  Scheduler  │            │
│  │   Worker    │  │   Worker    │  │   Worker    │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Automation Layer (Stagehand)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Browser Pool (Playwright)                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│             Monitoring & Logging Infrastructure                 │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐     │
│  │  Sentry  │  │  Winston  │  │ DataDog  │  │Prometheus│     │
│  └──────────┘  └───────────┘  └──────────┘  └──────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Layer Architecture

### 1. Database Layer

**Purpose**: Data persistence and retrieval

**Components**:
- **PostgreSQL**: Primary relational database
  - User data
  - Subscriptions
  - Applications
  - Job profiles
  - Audit logs

- **Redis**: In-memory data store
  - Session storage
  - Cache layer
  - Queue management
  - Rate limiting data

**Design Patterns**:
- Repository pattern for data access
- Unit of Work for transactions
- Query optimization with indexes
- Read replicas for scaling reads

**Key Features**:
- ACID transactions
- Foreign key constraints
- Soft deletes for user data
- Audit trail for critical operations
- Automatic timestamps

---

### 2. Application Layer (Backend)

**Purpose**: Business logic and API endpoints

**Structure**:
```
src/
├── api/
│   ├── controllers/      # Request handlers
│   ├── routes/           # Route definitions
│   ├── middlewares/      # Express middlewares
│   └── validators/       # Request validation
├── services/             # Business logic
├── repositories/         # Data access layer
├── models/              # Database models
├── dto/                 # Data transfer objects
└── utils/               # Utility functions
```

**Design Patterns**:
- **Controller-Service-Repository pattern**
- **Dependency Injection**
- **DTO pattern** for data validation
- **Factory pattern** for creating complex objects
- **Strategy pattern** for platform-specific automation

**Key Principles**:
- Single Responsibility Principle
- Dependency Inversion
- Interface Segregation
- DRY (Don't Repeat Yourself)

---

### 3. Authentication Layer

**Purpose**: Verify user identity

**Flow Diagram**:

```
Google OAuth Flow:
User → Frontend → Google OAuth → Callback → Backend
  → Verify Token → Create/Update User → Issue JWT → Frontend

Magic Link Flow:
User → Email Input → Backend → Generate Token → Send Email
  → User Clicks Link → Backend → Verify Token → Issue JWT → Frontend
```

**Components**:

1. **Google OAuth 2.0**
```typescript
// Passport strategy for Google
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, verify));
```

2. **Magic Link**
```typescript
// Generate and send magic link
async function sendMagicLink(email: string) {
  const token = generateSecureToken();
  await saveMagicLinkToken(email, token, expiresIn);
  await sendEmail(email, magicLinkUrl);
}
```

3. **JWT Token Management**
- Access tokens (15 minutes expiry)
- Refresh tokens (7 days expiry)
- Token rotation on refresh

**Security Measures**:
- HTTPS only
- HttpOnly, Secure, SameSite cookies
- CSRF protection
- Rate limiting on auth endpoints
- Token blacklisting for logout

---

### 4. Authorization Layer

**Purpose**: Control access to resources

**RBAC Model**:

```
Roles Hierarchy:
SYSTEM_ADMIN (highest)
  └── ENTERPRISE_ADMIN
      └── ENTERPRISE_MEMBER
          └── USER (FREE/STARTER/PRO/UNLIMITED)
```

**Permission Matrix**:

| Resource | FREE | STARTER | PRO | UNLIMITED | ENTERPRISE | ADMIN |
|----------|------|---------|-----|-----------|------------|-------|
| View own applications | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create applications | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Schedule automations | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Multiple profiles | 1 | 3 | 5 | 10 | Custom | Unlimited |
| View team data | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Manage team | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| System settings | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

**Implementation**:

```typescript
// Decorator-based authorization
@UseGuards(AuthGuard, RolesGuard)
@Roles('PRO', 'UNLIMITED', 'ENTERPRISE')
async createScheduledAutomation() { }

// Middleware-based
router.post('/automation',
  authenticate,
  authorize(['PRO', 'UNLIMITED']),
  createAutomation
);
```

**Resource Ownership**:
- Users can only access their own resources
- Enterprise admins can access team resources
- System admins can access all resources

---

### 5. Queue Management Layer

**Purpose**: Asynchronous task processing

**Queue Architecture**:

```
                    Redis
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐
│ Application  │ │  Email   │ │Scheduler │
│    Queue     │ │  Queue   │ │  Queue   │
└──────┬───────┘ └────┬─────┘ └────┬─────┘
       │              │             │
       ▼              ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐
│ App Worker   │ │  Email   │ │Scheduler │
│  (5 inst.)   │ │  Worker  │ │  Worker  │
└──────────────┘ └──────────┘ └──────────┘
```

**Queue Types**:

1. **Application Queue**
   - Priority: HIGH
   - Concurrency: 5
   - Retry: 3 attempts with exponential backoff
   - Timeout: 10 minutes per job

2. **Email Queue**
   - Priority: MEDIUM
   - Concurrency: 10
   - Retry: 5 attempts
   - Timeout: 30 seconds per job

3. **Scheduler Queue**
   - Priority: LOW
   - Concurrency: 2
   - Retry: 1 attempt
   - Timeout: 5 minutes per job

4. **Notification Queue**
   - Priority: LOW
   - Concurrency: 10
   - Retry: 3 attempts
   - Timeout: 10 seconds per job

**Job Processing**:

```typescript
// Define job processor
applicationQueue.process('submit-application', 5, async (job) => {
  const { userId, applicationId } = job.data;

  try {
    // Update status
    await updateApplicationStatus(applicationId, 'processing');

    // Process application
    const result = await automationService.submitApplication(applicationId);

    // Update status
    await updateApplicationStatus(applicationId, 'submitted');

    // Deduct credit
    await creditService.deductCredit(userId, 1);

    // Send notification
    await notificationQueue.add('application-success', {
      userId,
      applicationId
    });

    return result;
  } catch (error) {
    // Log error
    await logApplicationError(applicationId, error);

    // Update status
    await updateApplicationStatus(applicationId, 'failed');

    throw error; // Trigger retry
  }
});
```

**Retry Strategy**:
```typescript
const retryStrategy = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s, 4s, 8s
  }
};
```

**Dead Letter Queue**:
- Failed jobs after max retries
- Manual review and reprocessing
- Analytics for failure patterns

---

### 6. Automation Layer

**Purpose**: Execute job applications via browser automation

**Architecture**:

```
Automation Service
  │
  ├── Platform Detector
  │     └── Identifies job board platform
  │
  ├── Platform Adapter Factory
  │     ├── GreenhouseAdapter
  │     ├── LeverAdapter
  │     ├── WorkdayAdapter
  │     └── GenericAdapter
  │
  ├── Form Detection Engine
  │     └── AI-powered form field identification
  │
  ├── Browser Pool Manager
  │     └── Manages Stagehand browser instances
  │
  └── State Machine
        ├── INIT
        ├── NAVIGATING
        ├── FILLING_FORM
        ├── SUBMITTING
        └── COMPLETED/FAILED
```

**Platform Adapters**:

Each adapter implements:
```typescript
interface IPlatformAdapter {
  detect(url: string): boolean;
  navigate(page: Page, url: string): Promise<void>;
  fillForm(page: Page, profile: JobProfile): Promise<void>;
  submit(page: Page): Promise<void>;
  captureScreenshot(page: Page): Promise<string>;
  verifySubmission(page: Page): Promise<boolean>;
}
```

**Stagehand Integration**:

```typescript
import { Stagehand } from '@browserbasehq/stagehand';

const stagehand = new Stagehand({
  env: 'BROWSERBASE', // or 'LOCAL'
  enableCaching: true,
  debugDom: false
});

await stagehand.init();
await stagehand.page.goto(jobUrl);

// AI-powered actions
await stagehand.act({ action: "fill in the email field with test@example.com" });
await stagehand.act({ action: "click the submit button" });

// AI-powered extraction
const jobDetails = await stagehand.extract({
  instruction: "extract job title, company, and salary",
  schema: z.object({
    title: z.string(),
    company: z.string(),
    salary: z.string().optional()
  })
});
```

**Error Handling**:
- Timeout handling (10 min max)
- Element not found fallbacks
- Captcha detection and human escalation
- Network error recovery
- Screenshot capture on failure

---

### 7. Error Handling & Logging Layer

**Purpose**: System observability and debugging

**Logging Levels**:
```
ERROR:   System failures, unhandled exceptions
WARN:    Recoverable errors, deprecated usage
INFO:    Important business events
DEBUG:   Detailed information for debugging
TRACE:   Very detailed information (dev only)
```

**Structured Logging**:

```typescript
logger.info('Application submitted', {
  userId: '123',
  applicationId: '456',
  jobTitle: 'Software Engineer',
  company: 'Acme Corp',
  platform: 'greenhouse',
  duration: 45000, // ms
  timestamp: new Date().toISOString()
});
```

**Error Handling Strategy**:

```typescript
// Global error handler
app.use((err, req, res, next) => {
  // Log error
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });

  // Send to monitoring service
  Sentry.captureException(err);

  // Return safe error to client
  res.status(err.statusCode || 500).json({
    error: {
      message: err.isOperational ? err.message : 'Internal server error',
      code: err.code || 'INTERNAL_ERROR'
    }
  });
});
```

**Monitoring Components**:

1. **Application Monitoring (Sentry/DataDog)**
   - Error tracking
   - Performance monitoring
   - User session replay
   - Custom events

2. **Infrastructure Monitoring (Prometheus + Grafana)**
   - CPU, memory, disk usage
   - Request rate and latency
   - Database connections
   - Queue metrics

3. **Logging (Winston → ELK/CloudWatch)**
   - Centralized log aggregation
   - Log search and analysis
   - Alert rules

4. **Health Checks**
```typescript
GET /health
{
  status: 'healthy',
  timestamp: '2025-01-13T10:00:00Z',
  services: {
    database: { status: 'up', latency: 5 },
    redis: { status: 'up', latency: 2 },
    queue: { status: 'up', jobs: { waiting: 10, active: 5 } }
  }
}
```

**Alert Rules**:
- Error rate > 1% for 5 minutes
- API latency p95 > 1s for 10 minutes
- Queue size > 1000 for 15 minutes
- Database connections > 80% for 5 minutes
- Disk usage > 90%

---

## Data Flow Examples

### 1. User Application Submission Flow

```
1. User submits application via Frontend
     │
     ▼
2. API validates request & checks credits
     │
     ├─ Insufficient credits → Return 402 error
     │
     ▼
3. Create application record (status: pending)
     │
     ▼
4. Add job to application queue
     │
     ▼
5. Return 202 Accepted to client
     │
     ▼
6. Queue worker picks up job
     │
     ▼
7. Update status to 'processing'
     │
     ▼
8. Automation layer processes application
     │
     ├─ Success → Update status to 'submitted'
     │           ├─ Deduct credit
     │           ├─ Send success notification
     │           └─ Capture screenshot
     │
     └─ Failure → Update status to 'failed'
                  ├─ Log error
                  ├─ Retry (if attempts < 3)
                  └─ Send failure notification
```

### 2. Scheduled Automation Flow

```
1. Cron job runs every minute
     │
     ▼
2. Query scheduled_automations where:
     - is_active = true
     - next_run_at <= NOW()
     │
     ▼
3. For each scheduled automation:
     │
     ├─ Check user credits
     │   └─ Insufficient → Skip & notify user
     │
     ├─ Create automation_run record
     │
     ├─ Search for matching jobs
     │   └─ Use search_criteria & filters
     │
     ├─ Limit results to max_applications_per_run
     │
     ├─ For each job:
     │   ├─ Create application record
     │   └─ Add to application queue
     │
     ├─ Update next_run_at
     │
     └─ Send summary email when all complete
```

### 3. Credit Reset Flow

```
1. Cron job runs every hour
     │
     ▼
2. Query subscriptions where:
     - credits_reset_at <= NOW()
     │
     ▼
3. For each subscription:
     │
     ├─ Yearly plans:
     │   ├─ Reset credits_used to 0
     │   └─ Set credits_reset_at to tomorrow
     │
     └─ Monthly plans:
         ├─ Reset credits_used to 0
         └─ Set credits_reset_at to next billing cycle
```

## Security Architecture

### Authentication Flow
```
1. User authenticates → Backend validates
2. Backend issues JWT access token (15 min)
3. Backend issues refresh token (7 days)
4. Store refresh token in HttpOnly cookie
5. Store access token in memory (not localStorage)
6. On access token expiry → Use refresh token
7. Rotate refresh token on each use
```

### Data Protection
- **Encryption at rest**: PostgreSQL encryption
- **Encryption in transit**: TLS 1.3
- **PII handling**: Separate encrypted columns
- **Password hashing**: bcrypt with salt rounds 12
- **Token signing**: RS256 with key rotation

### Rate Limiting
```typescript
// Per endpoint rate limits
POST /api/applications → 10 req/min per user
POST /api/auth/magic-link → 3 req/15min per IP
GET /api/* → 100 req/min per user
```

## Scalability Strategies

### Horizontal Scaling
- **API Servers**: Stateless, scale behind load balancer
- **Queue Workers**: Add workers as queue size increases
- **Database**: Read replicas for GET requests

### Vertical Scaling
- **Database**: Increase resources for write-heavy loads
- **Redis**: Increase memory for larger cache

### Caching Strategy
```
- User sessions: 15 minutes
- Subscription data: 1 hour
- Job profiles: 30 minutes
- Application lists: 5 minutes
- Static data: 24 hours
```

### Database Optimization
- Indexes on frequently queried columns
- Partitioning for large tables (applications, logs)
- Archive old data (> 1 year) to cold storage
- Connection pooling (max 20 connections)

## Deployment Architecture

### Environments
1. **Development**: Local docker-compose
2. **Staging**: Kubernetes cluster (mimics production)
3. **Production**: Kubernetes with auto-scaling

### Container Structure
```
- app-api (NestJS API)
- app-worker (Queue workers)
- app-scheduler (Cron jobs)
- postgres (Database)
- redis (Cache/Queue)
- nginx (Reverse proxy)
```

### CI/CD Pipeline
```
1. Push to branch → GitHub Actions triggered
2. Run tests (unit, integration)
3. Build Docker images
4. Push to container registry
5. Deploy to staging (auto)
6. Run E2E tests
7. Deploy to production (manual approval)
8. Run smoke tests
9. Monitor for errors
```

## Disaster Recovery

### Backup Strategy
- **Database**:
  - Incremental backups every hour
  - Full backups daily
  - Retention: 30 days
  - Off-site replication

- **File Storage**:
  - S3 versioning enabled
  - Cross-region replication

### Recovery Time Objectives (RTO)
- Critical services: < 1 hour
- Non-critical services: < 4 hours
- Full system: < 8 hours

### Recovery Point Objectives (RPO)
- Database: < 1 hour data loss
- File storage: < 5 minutes data loss

## Performance Benchmarks

### Expected Throughput
- API requests: 1,000 req/s
- Application submissions: 100/min
- Email sending: 500/min
- Concurrent users: 10,000

### Resource Requirements (Production)
- API servers: 4 instances × 2 vCPU, 4GB RAM
- Workers: 6 instances × 2 vCPU, 4GB RAM
- Database: 1 instance × 4 vCPU, 16GB RAM, 100GB SSD
- Redis: 1 instance × 2 vCPU, 8GB RAM
- Total: ~32 vCPU, 88GB RAM

## Compliance & Regulations

### GDPR Compliance
- Right to access (data export)
- Right to be forgotten (soft delete + anonymization)
- Data portability
- Consent management
- Breach notification (< 72 hours)

### Data Retention
- Active users: Indefinite
- Deleted accounts: 30 days grace period
- Logs: 90 days
- Backups: 30 days
- Audit logs: 7 years

### Terms of Service
- Clear disclosure of automation usage
- User responsibility for account credentials
- Platform terms compliance
- No warranty for application success

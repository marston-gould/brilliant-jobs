# Component Pattern Library (SA-013)

> Every page migration (SA-014+) must follow these patterns. No exceptions.

## Design System Primitives

### Button
```tsx
import { Button } from '@components';

// Variants: primary, secondary, ghost, danger
<Button variant="primary" size="md">Save Job</Button>
<Button variant="ghost" size="sm" icon={<SearchIcon />}>Search</Button>
<Button variant="danger" loading={isDeleting}>Delete</Button>
```

### Card
```tsx
import { Card } from '@components';

// Variants: default, elevated, outline, inset
<Card variant="elevated" padding="lg">
  <h3>Job Details</h3>
  <p>...</p>
</Card>
```

### Badge
```tsx
import { Badge } from '@components';

// Variants: default, success, warning, error, info, purple
<Badge variant="success" dot>Active</Badge>
<Badge variant="warning" size="sm">3 days ago</Badge>
```

### Input
```tsx
import { Input } from '@components';

<Input
  label="Search"
  placeholder="React developer..."
  icon={<SearchIcon />}
  error={errors.search}
/>
```

### Select
```tsx
import { Select } from '@components';

<Select
  label="Sort By"
  options={[
    { value: 'relevance', label: 'Relevance' },
    { value: 'date', label: 'Date' },
    { value: 'salary', label: 'Salary' },
  ]}
  value={sortBy}
  onChange={handleSort}
/>
```

### Modal
```tsx
import { Modal, Button } from '@components';

<Modal
  open={showModal}
  onClose={() => setShowModal(false)}
  title="Confirm Action"
  size="md"
  footer={
    <>
      <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
      <Button variant="primary" onClick={handleConfirm}>Confirm</Button>
    </>
  }
>
  <p>Are you sure you want to proceed?</p>
</Modal>
```

## Data Access Rules

### Always use providers
```tsx
// ✅ CORRECT — use provider hooks
import { useSearch, useJobs } from '@providers';

function FeedPage() {
  const search = useSearch();
  const jobs = useJobs();
  const results = await search.search({ query: 'react' });
}

// ❌ WRONG — direct Supabase access
function FeedPage() {
  const results = await window.BJ.supabase.from('ats_jobs').select('*');
}
```

### Error handling
```tsx
import { ProviderError } from '@providers';

try {
  await jobs.save(jobId);
} catch (e) {
  if (e instanceof ProviderError) {
    // Structured error with code, status, cause
    console.error(`[${e.code}] ${e.message}`);
  }
}
```

## Migration Checklist

For every page migrated from legacy to React:

- [ ] Page component uses design system primitives (Button, Card, etc.)
- [ ] Zero inline styles (`style=` attribute)
- [ ] Zero hardcoded colors — all colors from CSS custom properties via Tailwind
- [ ] Dark mode complete — tested in both light and dark
- [ ] All data access through providers — no `window.BJ.supabase` calls
- [ ] TypeScript strict — no `any` types
- [ ] Accessibility: proper ARIA attributes, keyboard navigation, focus management
- [ ] Loading states for all async operations
- [ ] Error states for all data fetches
- [ ] Bundle size checked: page chunk < 50KB gzip
- [ ] All existing functionality preserved (functional parity with legacy)
- [ ] Tests: component tests with mock providers

## File Organization

```
src/app/pages/dashboard/
├── FeedPage.tsx           # Page container
├── components/            # Page-specific components
│   ├── JobCard.tsx
│   ├── SearchBar.tsx
│   └── FilterSidebar.tsx
└── hooks/                 # Page-specific hooks
    └── useFeedData.ts
```

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Page component | `XxxPage` | `FeedPage`, `PipelinePage` |
| Shared component | `PascalCase` | `Button`, `JobCard` |
| Hook | `useXxx` | `useSearch`, `useFeedData` |
| Provider | `XxxProvider` | `SearchProvider`, `JobProvider` |
| Type | `PascalCase` | `Job`, `SearchParams` |
| File | `PascalCase.tsx` | `FeedPage.tsx`, `Button.tsx` |
| Test | `XxxPage.test.tsx` | `FeedPage.test.tsx` |

## Dark Mode

All components get dark mode automatically via CSS custom properties.
The color system in `src/input.css` defines both `:root` and `[data-theme="dark"]`
variants. Tailwind utilities like `bg-bg-card`, `text-text`, `border-border` resolve
to the correct color in either mode.

**Do NOT use:**
- `bg-white`, `text-black`, `border-gray-300` (hardcoded, no dark mode)
- `dark:` Tailwind variant (we use `[data-theme="dark"]`, not class strategy)

**Do use:**
- `bg-bg-card` (resolves to white in light, dark card color in dark)
- `text-text-dim` (resolves to appropriate dim color in either mode)
- `border-border` (resolves to appropriate border in either mode)

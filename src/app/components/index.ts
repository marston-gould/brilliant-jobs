// ============================================================
// Design System Components — Public API (SA-013)
// ============================================================
// Import all components from this barrel:
//   import { Button, Card, Badge, Input, Select, Modal } from '@components';
//
// MIGRATION RULE: All new UI must use these primitives.
// Do NOT create one-off styled elements with raw Tailwind classes.
// If a pattern appears twice, extract it as a component here.
// ============================================================

export { Button } from './Button';
export { Card } from './Card';
export { Badge } from './Badge';
export { Input } from './Input';
export { Select } from './Select';
export { Modal } from './Modal';
export { ToastProvider, useToast } from './Toast';
export type { Toast, ToastType } from './Toast';
export {
  Skeleton, SkeletonHeader, SkeletonMetricRow,
  SkeletonCardList, SkeletonTable, SkeletonPage,
} from './Skeleton';
export { PageHeader } from './PageHeader';

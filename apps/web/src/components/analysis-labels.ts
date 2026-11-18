import type { Priority, RequirementStatus, RequirementType } from '@copilot/contracts';

export const STATUS_LABEL: Record<RequirementStatus, string> = {
  ai_suggested: 'AI suggestion',
  confirmed: 'Confirmed',
  needs_clarification: 'Needs clarification',
  rejected: 'Rejected',
};
export const STATUS_VARIANT: Record<
  RequirementStatus,
  'info' | 'success' | 'warning' | 'destructive'
> = {
  ai_suggested: 'info',
  confirmed: 'success',
  needs_clarification: 'warning',
  rejected: 'destructive',
};
export const TYPE_LABEL: Record<RequirementType, string> = {
  functional: 'Functional',
  non_functional: 'Non-functional',
  constraint: 'Constraint',
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
export const PRIORITY_DOT: Record<Priority, string> = {
  urgent: 'bg-destructive',
  high: 'bg-warning',
  medium: 'bg-primary',
  low: 'bg-muted-foreground',
};

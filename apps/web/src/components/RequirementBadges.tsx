import type { Priority, Requirement } from '@copilot/contracts';
import { Badge } from '@/components/ui/badge';
import {
  PRIORITY_DOT,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_VARIANT,
} from '@/components/analysis-labels';

export function StatusBadge({ status }: { status: Requirement['status'] }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className={`size-2 rounded-full ${PRIORITY_DOT[priority]}`} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/** "Edited" and "Unverified source" tags next to a requirement. */
export function Flags({ r }: { r: Requirement }) {
  return (
    <>
      {r.editedByUser && <Badge variant="secondary">Edited</Badge>}
      {r.sourceUnverified && <Badge variant="warning">Unverified source</Badge>}
    </>
  );
}

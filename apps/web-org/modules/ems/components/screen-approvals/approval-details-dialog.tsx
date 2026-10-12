'use client';
import { Dialog, DialogContent, DialogTitle } from '@smarteam/ui';
import type { ApprovalInboxItem } from '../../hooks/use-approval-inbox';
import { ApprovalAttachments } from './approval-attachments';

function snapshotFacts(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== 'object') return [];
  const data = value as Record<string, unknown>;
  const facts: Array<[string, string]> = [];
  for (const [key, label] of [
    ['correctedCheckIn', 'Check-in'],
    ['correctedCheckOut', 'Check-out'],
    ['workedMinutes', 'Worked minutes'],
    ['overtimeMinutes', 'Overtime minutes'],
    ['dayStatus', 'Day status'],
  ]) {
    if (data[key!] !== undefined) facts.push([label!, String(data[key!])]);
  }
  if (Array.isArray(data.punches))
    for (const row of data.punches as unknown[]) {
      if (row && typeof row === 'object') {
        const punch = row as Record<string, unknown>;
        facts.push([
          typeof punch.punchType === 'string' ? punch.punchType : 'Punch',
          typeof punch.occurredAt === 'string' ? punch.occurredAt : '',
        ]);
      }
    }
  return facts;
}
export function ApprovalDetailsDialog({
  item,
  onClose,
}: {
  item: ApprovalInboxItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle className="sticky top-[-1.25rem] z-20 -mx-5 -mt-5 bg-card px-5 pb-3 pt-5">
          {item?.title ?? 'Request details'}
        </DialogTitle>
        <p className="text-sm">{item?.requester}</p>
        <p className="text-xs text-muted-foreground">{item?.detail}</p>
        {item?.currentStep && (
          <p className="text-xs">
            Approval stage {item.currentStep.stepNumber} ·{' '}
            {item.currentStep.approverType.toLowerCase()}
          </p>
        )}
        {item?.warningReason && <p className="text-xs text-amber-700">{item.warningReason}</p>}
        {item?.domain === 'LEAVE' && Boolean(item.attachments?.length) && (
          <ApprovalAttachments key={item.id} item={item} />
        )}
        {item?.domain === 'ATTENDANCE_CORRECTION' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Original', item.beforeSnapshot],
              ['Requested', item.afterSnapshot],
            ].map(([label, value]) => (
              <section key={String(label)} className="rounded-md border border-border p-3">
                <h3 className="text-xs font-semibold">{String(label)}</h3>
                {snapshotFacts(value).map(([key, text], i) => (
                  <p key={`${key}-${i}`} className="mt-1 break-words text-xs">
                    {key}: {text}
                  </p>
                ))}
              </section>
            ))}
          </div>
        )}
        <p className="break-all text-[11px] text-muted-foreground">Request ID: {item?.id}</p>
      </DialogContent>
    </Dialog>
  );
}

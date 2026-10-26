'use client';
import { formatDate } from '@smarteam/contracts';
import { LoadingIndicator, Badge, Button, Checkbox, Input, Select } from '@smarteam/ui';
import { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import type { ApprovalInboxItem, ApprovalInboxState } from '../../hooks/use-approval-inbox';
import { EmptyState } from '../common/empty-state';
import { ApprovalBatchProgress } from './approval-batch-progress';
import { ApprovalDecisionDialog } from './approval-decision-dialog';
import { ApprovalDetailsDialog } from './approval-details-dialog';
import { HolidayReviewDialog } from './holiday-review-dialog';
import { approvalItemKey, useApprovalQueueController } from './use-approval-queue-controller';
import { useDebouncedValue } from '../../hooks/use-debounced-value';

/** Shared by Home and Approvals; every action is authorized and persisted by the server. */
export function ApprovalQueue({ inbox }: { inbox: ApprovalInboxState }) {
  const c = useApprovalQueueController(inbox);
  const [reviewing, setReviewing] = useState<ApprovalInboxItem | null>(null);
  const [details, setDetails] = useState<ApprovalInboxItem | null>(null);
  const [search, setSearch] = useState('');
  const settledSearch = useDebouncedValue(search.trim());
  const [category, setCategory] = useState('ALL');
  const [page, setPage] = useState(0);
  const filtered = useMemo(
    () =>
      inbox.items
        .filter(
          (item) =>
            (category === 'ALL' ||
              (category === 'OTHER'
                ? item.domain !== 'LEAVE' && item.domain !== 'ATTENDANCE_CORRECTION'
                : item.domain === category)) &&
            `${item.requester ?? ''} ${item.title} ${item.detail}`
              .toLowerCase()
              .includes(settledSearch.toLowerCase()),
        )
        .sort(
          (a, b) =>
            (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '') || a.id.localeCompare(b.id),
        ),
    [inbox.items, category, settledSearch],
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 50) - 1));
  const visible = filtered.slice(currentPage * 50, (currentPage + 1) * 50);
  const filteredSelectable = filtered.filter((item) =>
    c.selectable.some((row) => approvalItemKey(row) === approvalItemKey(item)),
  );
  const selectedFiltered = filteredSelectable.filter((item) =>
    c.selected.has(approvalItemKey(item)),
  );
  const leaveCount = inbox.items.filter((item) => item.domain === 'LEAVE').length;
  const attendanceCount = inbox.items.filter(
    (item) => item.domain === 'ATTENDANCE_CORRECTION',
  ).length;
  const otherCount = inbox.items.length - leaveCount - attendanceCount;
  return (
    <>
      <div className="space-y-3">
        <ApprovalBatchProgress batch={inbox.batch} />
        {c.bulkResult && (
          <p role="status" className="text-xs">
            {c.bulkResult}
          </p>
        )}
        {inbox.saveError && (
          <p role="alert" className="text-xs text-destructive">
            {inbox.saveError}
          </p>
        )}
        {inbox.loading && (
          <LoadingIndicator
            variant="panel"
            label="Loading approvals"
            className="py-10 text-center text-xs"
          />
        )}
        {!inbox.loading && inbox.error && (
          <div className="rounded-md border border-destructive/30 p-3" role="alert">
            <p className="text-sm font-semibold">Could not load approvals</p>
            <p className="text-xs">{inbox.error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void inbox.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {!inbox.loading && !inbox.error && inbox.items.length === 0 && (
          <EmptyState
            detail="New requests assigned to you will appear here."
            icon={Inbox}
            title="Nothing awaiting your decision"
          />
        )}
        {!inbox.loading && inbox.items.length > 0 && (
          <>
            <section
              aria-label="Approval summary"
              className="grid grid-cols-2 gap-2 xl:grid-cols-4"
            >
              {(
                [
                  ['ALL', 'Awaiting your decision', inbox.items.length, 'All request types'],
                  ['LEAVE', 'Leave requests', leaveCount, 'Select to filter'],
                  [
                    'ATTENDANCE_CORRECTION',
                    'Attendance corrections',
                    attendanceCount,
                    'Select to filter',
                  ],
                  ['OTHER', 'Other requests', otherCount, 'Holiday and financial requests'],
                ] as const
              ).map(([value, label, count, hint]) => (
                <button
                  aria-pressed={category === value || (value === 'OTHER' && category === 'OTHER')}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  key={value}
                  onClick={() => {
                    setCategory(value);
                    setPage(0);
                  }}
                  type="button"
                >
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                  <span className="mt-0.5 block text-xl font-semibold tabular-nums">{count}</span>
                  <span className="text-[10px] text-muted-foreground">{hint}</span>
                </button>
              ))}
            </section>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Search approvals"
                placeholder="Search employee or request"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                className="max-w-sm"
              />
              <Select
                aria-label="Approval category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setPage(0);
                }}
                className="rounded-md border border-border bg-background p-2 text-xs"
              >
                <option value="ALL">All categories</option>
                <option value="OTHER">Other request types</option>
                {[...new Set(inbox.items.map((item) => item.domain))].map((domain) => (
                  <option key={domain} value={domain}>
                    {domain.toLowerCase().replaceAll('_', ' ')}
                  </option>
                ))}
              </Select>
              <span className="text-xs text-muted-foreground">{filtered.length} requests</span>
            </div>
            {c.selectable.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    aria-label={`Select all ${filteredSelectable.length} eligible filtered approvals`}
                    disabled={c.busy || filteredSelectable.length === 0}
                    checked={
                      filteredSelectable.length > 0 &&
                      selectedFiltered.length === filteredSelectable.length
                    }
                    onCheckedChange={(checked) =>
                      checked === true
                        ? c.setSelected((current) => {
                            const next = new Set(current);
                            filteredSelectable.forEach((item) => next.add(approvalItemKey(item)));
                            return next;
                          })
                        : c.setSelected((current) => {
                            const next = new Set(current);
                            filteredSelectable.forEach((item) =>
                              next.delete(approvalItemKey(item)),
                            );
                            return next;
                          })
                    }
                  />
                  Select all {filteredSelectable.length} eligible filtered approvals
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{c.chosen.length} selected</span>
                  {c.chosen.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={c.busy}
                      onClick={() => c.setSelected(new Set())}
                    >
                      Deselect all
                    </Button>
                  )}
                  {c.chosen.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={c.busy || c.chosen.length > 1000}
                      onClick={() => c.openRejection(c.chosen)}
                    >
                      Reject {c.chosen.length}
                    </Button>
                  )}
                  {c.chosen.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={c.busy || c.chosen.length > 1000}
                      onClick={() => void c.handleApprove(c.chosen)}
                    >
                      Approve {c.chosen.length}
                    </Button>
                  )}
                </div>
                <p className="w-full text-[11px] text-muted-foreground">
                  Selection is retained across pages. Up to 1,000 per batch. Attendance
                  regularizations and financial requests require individual review.
                </p>
              </div>
            )}
            {visible.map((item) => {
              const selectable = c.selectable.some(
                (row) => approvalItemKey(row) === approvalItemKey(item),
              );
              return (
                <div
                  key={approvalItemKey(item)}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {c.selectable.length > 1 && selectable && (
                      <Checkbox
                        aria-label={`Select ${item.title}`}
                        disabled={c.busy}
                        checked={c.selected.has(approvalItemKey(item))}
                        onCheckedChange={(checked) =>
                          c.setSelected((current) => {
                            const next = new Set(current);
                            if (checked === true) next.add(approvalItemKey(item));
                            else next.delete(approvalItemKey(item));
                            return next;
                          })
                        }
                      />
                    )}
                    <div className="min-w-0">
                      {item.requester && <p className="text-xs font-semibold">{item.requester}</p>}
                      <p className="text-xs font-bold">{item.title}</p>
                      {item.domain === 'ADVANCE' && (
                        <span className="text-[11px] text-muted-foreground">
                          Financial · Individual Review
                        </span>
                      )}
                      {item.requiresIndividualReview && (
                        <span className="text-[11px] text-muted-foreground">
                          Attendance regularization · Individual review
                        </span>
                      )}
                      <p className="break-words text-xs text-muted-foreground">{item.detail}</p>
                      {item.currentStep && (
                        <p className="text-[11px] text-muted-foreground">
                          Approval stage {item.currentStep.stepNumber}
                        </p>
                      )}
                      {item.warningReason && (
                        <p className="text-[11px] text-amber-700">{item.warningReason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {item.submittedAt ? formatDate(item.submittedAt) : 'pending'}
                    </Badge>
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => setDetails(item)}
                    >
                      Details
                    </Button>
                    {item.domain === 'HOLIDAY_CHECK_IN' && inbox.canDecide(item) ? (
                      <Button
                        size="sm"
                        type="button"
                        disabled={c.busy}
                        onClick={() => {
                          inbox.dismissError();
                          setReviewing(item);
                        }}
                      >
                        Review
                      </Button>
                    ) : inbox.canDecide(item) ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={c.busy}
                          onClick={() => c.openRejection([item])}
                        >
                          Reject
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={c.busy}
                          onClick={() => void c.handleApprove([item])}
                        >
                          Approve
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">You cannot decide this</span>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-2 text-xs">
              <span>
                Page {currentPage + 1} of {Math.max(1, Math.ceil(filtered.length / 50))}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={(currentPage + 1) * 50 >= filtered.length}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
      <HolidayReviewDialog item={reviewing} inbox={inbox} onClose={() => setReviewing(null)} />
      <ApprovalDetailsDialog item={details} onClose={() => setDetails(null)} />
      <ApprovalDecisionDialog controller={c} />
    </>
  );
}

import { UUID } from '@Tools/UUID';

// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_SANCTIONING_RECORD,
  AMENDMENT_NOT_FOUND,
  AMENDMENT_NOT_ALLOWED,
  CHANGE_WINDOW_CLOSED,
  AMENDABLE_STATUSES,
} from '@Constants/sanctioningConstants';

// Types
import type {
  SanctioningRecord,
  SanctioningPolicy,
  Amendment,
  ProposalChange,
  AmendmentSeverity,
  AmendmentRules,
} from '@Types/sanctioningTypes';

// ---------------------------------------------------------------------------
// Propose Amendment
// ---------------------------------------------------------------------------

type ProposeAmendmentArgs = {
  sanctioningRecord: SanctioningRecord;
  changes: ProposalChange[];
  sanctioningPolicy?: SanctioningPolicy;
  proposedBy?: string;
};

export function proposeAmendment({ sanctioningRecord, changes, sanctioningPolicy, proposedBy }: ProposeAmendmentArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!Array.isArray(changes) || changes.length === 0) {
    return { error: INVALID_VALUES, context: { message: 'At least one change is required' } };
  }
  if (!AMENDABLE_STATUSES.includes(sanctioningRecord.status)) {
    return { error: AMENDMENT_NOT_ALLOWED, context: { status: sanctioningRecord.status } };
  }

  const policy = sanctioningPolicy ?? sanctioningRecord.policySnapshot;
  const rules = policy?.amendmentRules;

  // Timeline gate
  const timelineCheck = checkTimeline(sanctioningRecord, rules);
  if (timelineCheck.blocked) {
    return { error: CHANGE_WINDOW_CLOSED, context: { message: timelineCheck.reason } };
  }

  // Classify severity
  const severity = classifySeverity(changes, rules);

  const now = new Date().toISOString();
  const amendment: Amendment = {
    amendmentId: UUID(),
    status: 'PROPOSED',
    proposedAt: now,
    proposedBy,
    changes,
    severity,
    withinTimeline: timelineCheck.withinSubstantialWindow !== false,
  };

  // Auto-approve minor amendments within timeline if no reviewer needed
  if (severity === 'MINOR' && timelineCheck.withinSubstantialWindow !== false) {
    amendment.status = 'APPROVED';
    amendment.resolvedAt = now;
    applyChanges(sanctioningRecord, changes);
  }

  sanctioningRecord.amendments ??= [];
  sanctioningRecord.amendments.push(amendment);
  sanctioningRecord.updatedAt = now;
  sanctioningRecord.version += 1;

  return {
    ...SUCCESS,
    amendmentId: amendment.amendmentId,
    severity,
    autoApproved: amendment.status === 'APPROVED',
  };
}

// ---------------------------------------------------------------------------
// Review Amendment
// ---------------------------------------------------------------------------

type ReviewAmendmentArgs = {
  sanctioningRecord: SanctioningRecord;
  amendmentId: string;
  approved: boolean;
  reviewerNotes?: string;
};

export function reviewAmendment({ sanctioningRecord, amendmentId, approved, reviewerNotes }: ReviewAmendmentArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!amendmentId) return { error: INVALID_VALUES, context: { message: 'Missing amendmentId' } };

  const amendment = sanctioningRecord.amendments?.find((a) => a.amendmentId === amendmentId);
  if (!amendment) return { error: AMENDMENT_NOT_FOUND, context: { amendmentId } };

  if (amendment.status !== 'PROPOSED') {
    return { error: INVALID_VALUES, context: { message: `Amendment is ${amendment.status}, not PROPOSED` } };
  }

  const now = new Date().toISOString();
  amendment.resolvedAt = now;
  if (reviewerNotes) amendment.reviewerNotes = reviewerNotes;

  if (approved) {
    amendment.status = 'APPROVED';
    applyChanges(sanctioningRecord, amendment.changes);
  } else {
    amendment.status = 'REJECTED';
  }

  sanctioningRecord.updatedAt = now;
  sanctioningRecord.version += 1;

  return { ...SUCCESS, approved };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifySeverity(changes: ProposalChange[], rules?: AmendmentRules): AmendmentSeverity {
  if (!rules?.substantialChangeFields?.length) return 'MINOR';

  const isSubstantial = changes.some((change) => {
    // Normalize bracket notation: "events[0].drawSize" → "events.0.drawSize"
    const normalizedField = change.field.replaceAll(/\[(\d+)\]/g, '.$1');
    return rules.substantialChangeFields!.some((pattern) => {
      // Support wildcard patterns like "events.*.drawSize"
      const regex = new RegExp('^' + pattern.replaceAll('.*.', String.raw`\.[^.]+\.`).replaceAll('*', '[^.]+') + '$');
      return regex.test(normalizedField);
    });
  });

  return isSubstantial ? 'SUBSTANTIAL' : 'MINOR';
}

function checkTimeline(
  record: SanctioningRecord,
  rules?: AmendmentRules,
): { blocked: boolean; reason?: string; withinSubstantialWindow?: boolean } {
  if (!rules) return { blocked: false };

  const startDate = new Date(record.proposal.proposedStartDate);
  const now = new Date();
  const weeksUntil = (startDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000);

  if (rules.noChangeWindowWeeks && weeksUntil < rules.noChangeWindowWeeks) {
    return {
      blocked: true,
      reason: `No changes permitted within ${rules.noChangeWindowWeeks} weeks of event (${Math.floor(weeksUntil)} weeks remaining)`,
    };
  }

  const withinSubstantialWindow =
    rules.substantialChangeWindowWeeks === undefined ? undefined : weeksUntil >= rules.substantialChangeWindowWeeks;

  return { blocked: false, withinSubstantialWindow };
}

// Fields amendments are allowed to modify. All other paths are rejected to prevent tampering with
// internal state. Every entry here addresses the proposal EXCEPT the ones in RECORD_LEVEL_FIELDS
// below, which live on the sanctioning record itself.
const AMENDABLE_FIELD_PREFIXES = new Set([
  'tournamentName',
  'formalName',
  'promotionalName',
  'proposedStartDate',
  'proposedEndDate',
  'hostCountryCode',
  'surfaceCategory',
  'indoorOutdoor',
  'localTimeZone',
  'sanctioningTier',
  'totalPrizeMoney',
  'entryFees',
  'calendarSection',
  'events',
  'venues',
  'officials',
  'tournamentDirector',
  'referee',
  'registrationProfile',
]);

/**
 * Amendable fields that live on the sanctioning RECORD, not on its proposal.
 *
 * `sanctioningTier` is the only one today. It was previously routed at `proposal.sanctioningTier` —
 * a field that was declared but never assigned by any path, so every amendment to it wrote a
 * property nothing read. The tier's single home is the record; the amendment has to follow it.
 */
const RECORD_LEVEL_FIELDS = new Set(['sanctioningTier']);

function fieldRoot(field: string): string {
  return field.replaceAll(/\[\d+\]/g, '.*').split('.')[0];
}

function isAmendableField(field: string): boolean {
  return AMENDABLE_FIELD_PREFIXES.has(fieldRoot(field));
}

/** `name[index]` notation in an amendment path, e.g. `events[0].drawSize`. */
const ARRAY_KEY = /^(\w+)\[(\d+)\]$/;

/** Resolve one path segment against `target`. Undefined when the segment does not lead anywhere. */
function descend(target: any, key: string): any {
  const arrayMatch = ARRAY_KEY.exec(key);
  if (!arrayMatch) return target?.[key];

  const arr = target?.[arrayMatch[1]];
  const idx = Number.parseInt(arrayMatch[2]);
  if (!Array.isArray(arr) || idx < 0 || idx >= arr.length) return undefined;
  return arr[idx];
}

/** Walk every segment but the last, so the caller ends up holding the object to write into. */
function resolveContainer(root: any, parts: string[]): any {
  let target = root;
  for (const key of parts.slice(0, -1)) {
    target = descend(target, key);
    if (target === undefined || target === null) return undefined;
  }
  return target;
}

/** Write at the final segment. Out-of-bounds array writes are dropped rather than extending the array. */
function assignAt(container: any, lastKey: string, value: any) {
  const arrayMatch = ARRAY_KEY.exec(lastKey);
  if (!arrayMatch) {
    container[lastKey] = value;
    return;
  }

  const arr = container[arrayMatch[1]];
  const idx = Number.parseInt(arrayMatch[2]);
  if (Array.isArray(arr) && idx >= 0 && idx < arr.length) arr[idx] = value;
}

function applyChanges(record: SanctioningRecord, changes: ProposalChange[]) {
  for (const change of changes) {
    if (change.changeType === 'REMOVED') continue;
    if (!isAmendableField(change.field)) continue;

    const parts = change.field.split('.');
    const root = RECORD_LEVEL_FIELDS.has(fieldRoot(change.field)) ? record : record.proposal;
    const container = resolveContainer(root, parts);
    const lastKey = parts.at(-1);

    if (container !== undefined && container !== null && lastKey) {
      assignAt(container, lastKey, change.proposedValue);
    }
  }
}

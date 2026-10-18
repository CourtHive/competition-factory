import { changedEntities, conformanceViolations } from '../../mutations/notifications/noticeConformance/harness';
import { topicConstants } from '@Constants/topicConstants';
import fs from 'fs';
import {
  getInvokeObserver,
  getProvider,
  getTournamentRecords,
  setGlobalSubscriptions,
  setInvokeObserver,
  type InvokeEvent,
  type Notice,
} from '@Global/state/globalState';

import type { CapturedNotice } from '../../mutations/notifications/noticeConformance/harness';
import type { Extension } from '@Types/tournamentTypes';

/**
 * Notice coverage over the whole suite: every engine call any test makes, checked against the
 * notice-conformance rules (`noticeConformance/harness.ts`), which until now ran only over a
 * hand-written catalog of scenarios.
 *
 * For each call: the records are captured at `before`; at `after`, a successful call's changed
 * entities are checked against the notices it buffered. The buffer is mirrored by wrapping the
 * provider's `addNotice` / `deleteNotice` / `deleteNotices`, so a notice counts only if the provider
 * accepted it and nothing withdrew it: exactly what a subscriber would be handed. Every topic gets a
 * global no-op subscription, because many mutations build a notice only when its topic is
 * subscribed.
 *
 * Whichever provider is active when a test starts is mirrored (the suite's default is a copy of the
 * sync provider, `rethrowingStateProvider`). A provider a test installs mid-test is not measured.
 */

type MethodTally = {
  calls: number; // successful calls under a measured provider
  changed: number; // ...that changed a record
  silent: number; // ...that changed a record and buffered no notice at all
  violating: number; // ...with at least one conformance violation
  reasons: Record<string, number>; // `${kind} ${change}: ${reason}` → count
  examples: string[]; // test names, a few per method
};

// `saved`: the call's notices that a delivery (deleteNotices) cleared from the buffer before its `after`
// `mark`: the sequence number of the first notice this call could have buffered. A sequence number, not
// an index: a keyed supersession or a deleteNotice can remove notices buffered BEFORE the call (an
// undelivered notice from a direct, non-engine mutation), and an index would then skip the call's own.
type Open = { methodName: string; before: Record<string, any>; mark: number; saved: CapturedNotice[] };

const MAX_EXAMPLES = 3;
const MIRRORED = Symbol('noticeCoverageMirror');

export class NoticeCoverageCollector {
  private readonly outFile: string;
  private readonly tally = new Map<string, MethodTally>();
  // every dispatch, whatever its result or provider: which engine methods the suite reaches at all
  private readonly invoked = new Map<string, number>();
  private readonly stack: Open[] = [];
  private buffered: (CapturedNotice & { key?: string; seq: number })[] = [];
  private seq = 0;
  private previous: ((event: InvokeEvent) => void) | undefined;
  testFile = '';
  testName = '';

  constructor(outFile: string) {
    this.outFile = outFile;
  }

  /** Re-applied before each test: a test may replace the observer or the global subscriptions. */
  install() {
    const subscriptions = Object.fromEntries(
      (Object.values(topicConstants) as string[]).map((topic) => [topic, () => undefined]),
    );
    setGlobalSubscriptions({ subscriptions });
    const provider: any = getProvider();
    if (!provider.addNotice?.[MIRRORED]) this.mirror(provider);
    const current = getInvokeObserver();
    if (current !== this.observer) this.previous = current;
    setInvokeObserver(this.observer);
    this.stack.length = 0;
    this.buffered = [];
  }

  private measured() {
    return !!getProvider().addNotice?.[MIRRORED];
  }

  private mirror(provider: any) {
    const { addNotice, deleteNotice, deleteNotices } = provider;
    provider.addNotice = (notice: Notice, isGlobalSubscription?: boolean) => {
      const result = addNotice(notice, isGlobalSubscription);
      if (result?.success) {
        if (notice.key)
          this.buffered = this.buffered.filter((n) => !(n.topic === notice.topic && n.key === notice.key));
        this.buffered.push({ topic: notice.topic, payload: notice.payload, key: notice.key, seq: this.seq++ });
      }
      return result;
    };
    provider.deleteNotice = (params?: { topic?: string; key?: string }) => {
      const { topic, key } = params ?? {};
      this.buffered = this.buffered.filter((n) => !((!topic || n.topic === topic) && n.key === key));
      return deleteNotice(params);
    };
    provider.deleteNotices = () => {
      // engineInvoke delivers and clears BEFORE its `after`: calls still open keep what they buffered
      for (const open of this.stack) {
        open.saved.push(...this.since(open.mark));
        open.mark = 0;
      }
      this.buffered = [];
      return deleteNotices();
    };
    provider.addNotice[MIRRORED] = true;
  }

  private readonly observer = (event: InvokeEvent) => {
    try {
      if (event.phase === 'before') this.invoked.set(event.methodName, (this.invoked.get(event.methodName) ?? 0) + 1);
      if (this.measured()) this.observe(event);
    } catch {
      // a record the harness cannot copy (one holding a function): that call goes unmeasured, and the
      // test it belongs to must not see the harness's failure
      this.stack.length = 0;
    } finally {
      this.previous?.(event);
    }
  };

  private observe(event: InvokeEvent) {
    if (event.phase === 'before') {
      this.stack.push({ methodName: event.methodName, before: snapshot(), mark: this.seq, saved: [] });
      return;
    }
    const index = this.stack.map((open) => open.methodName).lastIndexOf(event.methodName);
    if (index < 0) return;
    const [open] = this.stack.splice(index);
    const result: any = (event as any).result;
    if (!result || result.error) return;
    this.record(open);
  }

  private record(open: Open) {
    const after = snapshot();
    const tally = this.methodTally(open.methodName);
    tally.calls += 1;

    const ids = new Set([...Object.keys(open.before), ...Object.keys(after)]);
    const notices: CapturedNotice[] = [...open.saved, ...this.since(open.mark)];
    let changed = false;
    let violating = false;
    for (const id of ids) {
      const before = open.before[id];
      const now = after[id];
      if (!before || !now) continue; // a record loaded or removed: not a mutation of a record
      if (stable(before) === stable(now)) continue;
      if (!changedEntities(before, now).length) continue; // only the factory stamp moved
      changed = true;
      for (const violation of conformanceViolations(before, now, notices)) {
        violating = true;
        const reason = `${violation.kind} ${violation.change}: ${violation.reason}`;
        tally.reasons[reason] = (tally.reasons[reason] ?? 0) + 1;
      }
    }
    if (!changed) return;
    tally.changed += 1;
    if (!notices.some(({ topic }) => !IGNORED_TOPICS.has(topic))) tally.silent += 1;
    if (violating) {
      tally.violating += 1;
      const example = `${this.testFile} :: ${this.testName}`;
      if (tally.examples.length < MAX_EXAMPLES && !tally.examples.includes(example)) tally.examples.push(example);
    }
  }

  private since(mark: number): CapturedNotice[] {
    return this.buffered.filter((notice) => notice.seq >= mark).map(({ topic, payload }) => ({ topic, payload }));
  }

  private methodTally(methodName: string): MethodTally {
    let tally = this.tally.get(methodName);
    if (!tally) {
      tally = { calls: 0, changed: 0, silent: 0, violating: 0, reasons: {}, examples: [] };
      this.tally.set(methodName, tally);
    }
    return tally;
  }

  flush() {
    if (!this.tally.size && !this.invoked.size) return;
    const line = JSON.stringify({
      file: this.testFile,
      methods: Object.fromEntries(this.tally),
      invoked: Object.fromEntries(this.invoked),
    });
    fs.appendFileSync(this.outFile, line + '\n');
  }
}

const IGNORED_TOPICS = new Set<string>([topicConstants.AUDIT, topicConstants.DATA_ISSUE, topicConstants.MUTATIONS]);

function snapshot(): Record<string, any> {
  const records = getTournamentRecords() ?? {};
  const copy: Record<string, any> = {};
  for (const [id, record] of Object.entries(records)) copy[id] = withoutStamp(structuredClone(record));
  return copy;
}

/** The factory extension carries the call's timeStamp; it is the engine's bookkeeping, not a change. */
function withoutStamp(record: any) {
  if (Array.isArray(record?.extensions))
    record.extensions = record.extensions.filter((extension: Extension) => extension?.name !== 'factory');
  return record;
}

const stable = (value: any) => JSON.stringify(value);

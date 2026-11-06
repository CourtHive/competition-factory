import { mustNotWrite } from './methodKinds';
import {
  getInvokeObserver,
  getProvider,
  getTournamentId,
  getTournamentRecords,
  readMutationStatus,
  setInvokeObserver,
  type InvokeEvent,
} from '@Global/state/globalState';

/**
 * Query purity: a query (or a generator) must leave engine state as it found it.
 *
 * For each engine call to such a method, three writes are detected:
 * - `record`: the loaded tournament records, or the selected tournament, differ between the call's `before` and
 *   `after`. `after` is reported once the engine has stamped modified records, so a query that set the modified
 *   flag shows here too, as a moved factory stamp.
 * - `notice:<topic>`: the call handed the provider a notice. The engine delivers a successful call's notices to
 *   subscribers whatever kind of method it was.
 * - `modified`: the call marked a tournament modified without a notice.
 *
 * Not the query's write: an INHERITED stamp. A write made outside the engine (a mutate function called directly, a
 * mocks generator) sets the modified flag and leaves it set; the next engine call, often a query, then stamps the
 * records it names. When the flag was set as the query began, the query made no write of its own, and the factory
 * stamp is the only change, the call is counted in `inheritedStamps`, not reported as an offense.
 *
 * Writes into a copy the query made for itself (a draft, a dry run) are not engine state and are not reported, unless
 * they reach the notice buffer or the modified flag.
 *
 * A call nested inside another is checked on its own; a write made by a nested MUTATION call is attributed to that
 * call, not to the query around it.
 */
export type Offense = {
  methodName: string;
  write: string;
  path?: string;
  // the call's boolean options: what asked for a write (`attach`, `addEvents: false`, ...)
  options: Record<string, boolean>;
};

type Open = {
  methodName: string;
  checked: boolean;
  before?: string;
  flagSet?: boolean;
  // the notice buffer's length when the call began: a write the call itself withdraws, by putting the buffer back to
  // this length (`withDraftWrites`, a rollback), never reaches a subscriber and is not an offense
  startNotices?: number;
  options: Record<string, boolean>;
  // the records object the call ran against: concurrent requests under per-request providers each hold their own, so
  // an `after` pairs with its own `before` and not with a same-named call another request has open
  records: unknown;
  writes: Set<string>;
};

// Marked on the provider, not on its `addNotice`: the other suite-wide harness wraps `addNotice` too, and a mark on
// the function it replaced is lost, so each would re-wrap before every test and this one would measure nothing.
const MIRRORED = Symbol('queryPurityMirror');

// The check the provider's mirrors report to. Resolved at call time, not closed over: on a run with `isolate: false` the
// provider object outlives a test file and keeps the mirrors installed by the first file, while each file's setup
// builds a new check. Closed over, every later file's writes went to the first file's check (measured: notices from
// ~130 generateDrawDefinition calls were missed that way).
let active: QueryPurityCheck | undefined;

/** The first path at which two JSON values differ, for the report: where a query wrote. */
export function firstDifference(a: any, b: any, path = ''): string | undefined {
  if (a === b) return undefined;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b))
    return path || '(root)';
  if (Array.isArray(a) && a.length !== b.length) return `${path}.length ${a.length} -> ${b.length}`;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(key in a)) return `${path}.${key} added`;
    if (!(key in b)) return `${path}.${key} removed`;
    const found = firstDifference(a[key], b[key], `${path}.${key}`);
    if (found) return found;
  }
  return undefined;
}

function fingerprint(): string {
  return JSON.stringify([getTournamentId(), getTournamentRecords()]);
}

// the factory stamp, first-class (NATIVE) or as an extension (LEGACY)
const isStamp = (key: string, value: any) =>
  (key === 'factory' && value && typeof value === 'object' && 'timeStamp' in value) ||
  (value?.name === 'factory' && value?.value && typeof value.value === 'object' && 'timeStamp' in value.value);

/** The same state without the factory stamp: to tell a moved stamp from a write. */
function unstamped(json: string): string {
  return JSON.stringify(JSON.parse(json), (key, value) => {
    if (Array.isArray(value)) return value.filter((item) => !isStamp('', item));
    return isStamp(key, value) ? undefined : value;
  });
}

function booleanOptions(params: Record<string, unknown> | undefined): Record<string, boolean> {
  const options: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(params ?? {})) if (typeof value === 'boolean') options[key] = value;
  return options;
}

function activate(check: QueryPurityCheck) {
  active = check;
}

const noticeCount = () => (getProvider() as any)?.getNoticeBuffer?.()?.length ?? 0;

function mirror(provider: any) {
  const { addNotice, markModified, setNoticeBuffer, setMutationStatus } = provider;
  provider.addNotice = function (notice: any, ...rest: any[]) {
    const open = active?.openQuery();
    // counted with notifications disabled too: the query attempted a write, whatever the provider then did with it
    if (open && typeof notice?.topic === 'string') open.writes.add(`notice:${notice.topic}`);
    return addNotice.call(this, notice, ...rest);
  };
  provider[MIRRORED] = true;
  if (typeof markModified === 'function')
    provider.markModified = function (...args: any[]) {
      active?.openQuery()?.writes.add('modified');
      return markModified.apply(this, args);
    };
  // the call put back what it announced: its notices and its modified mark are withdrawn, not written
  if (typeof setNoticeBuffer === 'function')
    provider.setNoticeBuffer = function (notices: any[], ...rest: any[]) {
      const result = setNoticeBuffer.call(this, notices, ...rest);
      const open = active?.openQuery();
      if (open && (notices?.length ?? 0) <= (open.startNotices ?? 0))
        for (const write of [...open.writes]) if (write.startsWith('notice:')) open.writes.delete(write);
      return result;
    };
  if (typeof setMutationStatus === 'function')
    provider.setMutationStatus = function (status: boolean, ...rest: any[]) {
      const open = active?.openQuery();
      if (open && !!status === !!open.flagSet) open.writes.delete('modified');
      return setMutationStatus.call(this, status, ...rest);
    };
}

export class QueryPurityCheck {
  private readonly stack: Open[] = [];
  private previous: ((event: InvokeEvent) => void) | undefined;
  offenses: Offense[] = [];
  checkedCalls = 0;
  inheritedStamps = 0;

  /** Re-applied before each test: a test may replace the observer or the state provider. */
  install() {
    activate(this);
    const provider: any = getProvider();
    if (provider && !provider[MIRRORED]) mirror(provider);
    const current = getInvokeObserver();
    if (current !== this.observer) this.previous = current;
    setInvokeObserver(this.observer);
    this.stack.length = 0;
  }

  take(): Offense[] {
    const offenses = this.offenses;
    this.offenses = [];
    return offenses;
  }

  /** The innermost open call, when it must not write: a write happening now belongs to it. */
  openQuery(): Open | undefined {
    const top = this.stack.at(-1);
    return top?.checked ? top : undefined;
  }

  // Re-entered only through a cycle of `previous` links: this harness and the other suite-wide one
  // (noticeCoverage / queryPurity) each re-install before every test and adopt the other's observer as
  // `previous`, so each chains to the other. The event has already been seen here; stop the walk.
  private observing = false;

  private readonly observer = (event: InvokeEvent) => {
    if (this.observing) return;
    this.observing = true;
    try {
      this.observe(event);
    } finally {
      try {
        this.previous?.(event);
      } finally {
        this.observing = false;
      }
    }
  };

  private observe(event: InvokeEvent) {
    if (event.phase === 'before') {
      const checked = mustNotWrite(event.methodName);
      if (checked) this.checkedCalls += 1;
      this.stack.push({
        methodName: event.methodName,
        before: checked ? fingerprint() : undefined,
        flagSet: checked ? readMutationStatus() === true : undefined,
        startNotices: checked ? noticeCount() : undefined,
        options: checked ? booleanOptions(event.params) : {},
        records: getTournamentRecords(),
        writes: new Set(),
        checked,
      });
      return;
    }
    const records = getTournamentRecords();
    const index = this.stack.findLastIndex((open) => open.methodName === event.methodName && open.records === records);
    if (index < 0) return;
    const [open] = this.stack.splice(index);
    if (!open.checked) return;
    const after = fingerprint();
    let path: string | undefined;
    if (open.before !== after) {
      if (open.flagSet && !open.writes.size && unstamped(open.before as string) === unstamped(after)) {
        this.inheritedStamps += 1;
        return;
      }
      open.writes.add('record');
      path = firstDifference(JSON.parse(open.before as string), JSON.parse(after));
    }
    for (const write of open.writes)
      this.offenses.push({
        methodName: open.methodName,
        write,
        path: write === 'record' ? path : undefined,
        options: open.options,
      });
  }
}

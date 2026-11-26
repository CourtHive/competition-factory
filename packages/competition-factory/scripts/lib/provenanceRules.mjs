/**
 * The internal governance references public text must not carry, shared by `verify:docs-provenance` (the published
 * documentation, READMEs and CHANGELOG) and `verify:source-provenance` (comments and test titles everywhere else).
 *
 * Public text states a rule or behaviour itself. It does not say who decided it or when ("(CA 2026-10-18)",
 * "ruling 33", "ruling OPEN-4", "debate-ruled"), and it does not point into the private planning repository (its
 * name, paths and task list, its plan ids such as P58, its finding ids such as F-042, the scoring-engine plan's
 * decision ids such as SE2a-D3b, the "controlling session"). A reader can check none of that.
 *
 * Each rule uses word boundaries so an identifier that merely contains the letters (`CAPS`, `documentation`, the
 * `P32` of `SET1-S:P32`) is not a hit. Case-sensitive unless flagged.
 */
export const RULES = [
  { name: 'ca', pattern: /\bCA\b/, what: 'names CA, or attributes a decision to CA' },
  {
    name: 'ruling-id',
    pattern: /\b[Rr]ulings? (?:\d|OPEN-\d|\([A-Za-z]\))/,
    what: 'cites a ruling by number or letter',
  },
  { name: 'open-id', pattern: /\bOPEN-\d+\b/, what: 'cites an OPEN-n decision id' },
  { name: 'debate-ruled', pattern: /\bdebate[- ]ruled\b/i, what: 'attributes a rule to a debate ruling' },
  { name: 'mentat', pattern: /\bmentat\b/i, what: 'names the private planning repository' },
  { name: 'controlling-session', pattern: /\bcontrolling session\b/i, what: 'names the controlling session' },
  { name: 'tasks', pattern: /\bTASKS\b/, what: "points at the planning repository's task list" },
  // P10–P99, not after `:`, a backtick, a word character or `-`, so the `P32` of `SET1-S:P32` / `` `P32` `` is not one
  { name: 'plan-id', pattern: /(?<![\w:`-])P[1-9]\d\b/, what: 'cites a plan id (P58, P59, …)' },
  { name: 'finding-id', pattern: /\bF-\d{3}\b/, what: 'cites a finding id (F-0xx)' },
  {
    name: 'decision-id',
    pattern: /\bSE\d[a-z]?-[A-Z]\d+/,
    what: 'cites a scoring-engine plan decision id (SE2a-D3b, …)',
  },
];

import { getGroups } from '@Query/matchUps/roundRobinTally/getGroups';
import { instanceCount } from '@Tools/arrays';
import { isNumeric } from '@Tools/math';

// types
import type {
  FinishingPosition,
  HeadToHeadMode,
  ParticipantResults,
  Recalculate,
  StandingsDirective,
  StandingsPhase,
  StandingsPolicy,
} from './standingsTypes';

type OrderParticipantsArgs = {
  participantResults: ParticipantResults;
  policy: StandingsPolicy;
  /** recomputes results over a scope; the caller owns how (a group's matchUps, a season's) */
  recalculate: Recalculate;
  /** an organiser's order within a set no directive splits (v1 `setSubOrder`) */
  subOrderMap?: Record<string, number>;
  /** what the order is for (e.g. a promotion cut): directives may apply only for some purposes (A8) */
  purpose?: string;
  /** PROVISIONAL while results are outstanding; directives may apply only at the end */
  phase?: StandingsPhase;
  /** seeds a LOT terminal; the same seed always draws the same order */
  lotSeed?: string;
};

/** what every step of one ordering shares */
type Context = {
  policy: StandingsPolicy;
  recalculate: Recalculate;
  purpose?: string;
  phase?: StandingsPhase;
  lotSeed?: string;
};

type SubSortArgs = {
  participantResults: ParticipantResults;
  disableHeadToHead?: boolean;
  participantIds: string[];
  context: Context;
  /** the first directive to try: 0, except where CONTINUE resumes after the directive that split */
  from?: number;
};

type SubSortResult = { order: FinishingPosition[]; report?: unknown[] };

/**
 * Orders participants by a standings policy: partition by the primary measure, then refine each tied set by the
 * directives in order. A directive that splits a set sends every part back through the directives from the first
 * (RESTART, spec § 4); a set no directive splits stays unresolved and shares a position.
 *
 * Pure. Results come in already computed; only the scoped recalculations a directive asks for (`idsFilter`,
 * `groupTotals`) go back to the caller, memoised here by scope.
 */
export function orderParticipants(params: OrderParticipantsArgs) {
  const { participantResults, policy, recalculate, subOrderMap, purpose, phase, lotSeed } = params;
  const report: unknown[] = [];
  const attribute = policy.primary;

  // a disqualified participant (K8) is ordered below everyone who is not; each set is ordered by the policy on its own
  const disqualified = Object.keys(participantResults).filter((participantId) =>
    policy.demote?.some((measure) => Number(participantResults[participantId][measure] ?? 0) > 0),
  );
  const sets = disqualified.length
    ? [Object.keys(participantResults).filter((participantId) => !disqualified.includes(participantId)), disqualified]
    : [undefined];
  if (disqualified.length) report.push({ attribute: 'disqualified', participantIds: disqualified });

  const sortedTallyGroups = sets.flatMap((participantIds) => {
    const orderedTallyGroups = getGroups({ participantResults, participantIds, attribute });
    report.push({ attribute, groups: orderedTallyGroups });
    return sortedGroups(orderedTallyGroups, false);
  });

  // One ordering reads one set of results under one policy, so a recalculation is decided by its grouping total and
  // its participant scope alone. An elimination draw ties hundreds of participants, and its sub-sorts asked for the
  // same unscoped recalculation hundreds of times: 809 times for one 512 draw.
  const context: Context = { policy, recalculate: memoise(recalculate), purpose, phase, lotSeed };
  const sortedOrder = sortedTallyGroups.map((participantIds) => {
    const result = groupSubSort({ participantIds, participantResults, context });
    report.push(...(result.report ?? []));
    return result.order;
  });

  const groupOrder = withSubGroups(sortedOrder);
  assignPositions(groupOrder);

  const positionsCount = instanceCount(groupOrder.map(({ position }) => position));
  for (const finishingPosition of groupOrder) {
    const { participantId, position } = finishingPosition;
    if (position === undefined) continue;
    // subOrder is only assigned if there are ties
    if (positionsCount[position] > 1) {
      finishingPosition.ties = positionsCount[position];
      if (subOrderMap && !finishingPosition.shared) finishingPosition.subOrder = subOrderMap[participantId];
    }
    finishingPosition.rankOrder = position;
    finishingPosition.groupOrder = position + (finishingPosition.subOrder || 1) - 1;
  }

  for (const finishingPosition of groupOrder) delete finishingPosition.shared;
  return { groupOrder, report: report.flat(Infinity).filter(Boolean) };
}

function sortedGroups(groups: Record<string, string[]>, reversed?: boolean) {
  return Object.keys(groups)
    .map((key) => Number.parseFloat(key))
    .sort((a, b) => (reversed ? a - b : b - a))
    .map((key) => groups[key]);
}

/** an unresolved position remembers the path of group indices that led to it, so unequal ties stay apart */
function withSubGroups(sortedOrder: FinishingPosition[][]) {
  return sortedOrder.flatMap((order, oi) =>
    order.map((o) => (o.resolved ? o : { ...o, subGroup: [oi].concat(...(o.subGroup ?? [])) })),
  );
}

/**
 * Competition ranking: a resolved participant takes its index + 1; consecutive unresolved participants from the same
 * sub-group share one position, and the next position skips past them.
 */
function assignPositions(groupOrder: FinishingPosition[]) {
  let lastSubGroup: number | undefined;
  let subGroupCount = 0;
  let groupPosition = 1;
  let priorPositionResolution: boolean | undefined;
  groupOrder.forEach((finishingPosition, index) => {
    if (index && (finishingPosition.resolved || (priorPositionResolution && !finishingPosition.resolved))) {
      groupPosition += 1;
    }
    priorPositionResolution = finishingPosition.resolved;

    const subGroup = Number.parseInt(finishingPosition.subGroup?.join('') || '0');

    if (finishingPosition.resolved) {
      finishingPosition.position = index + 1;
      groupPosition = finishingPosition.position;
    } else {
      if (lastSubGroup && subGroup > lastSubGroup) {
        groupPosition += subGroupCount;
        subGroupCount = 0;
      }
      finishingPosition.position = groupPosition;
      subGroupCount += 1;
    }

    lastSubGroup = subGroup;
  });
}

function memoise(recalculate: Recalculate): Recalculate {
  const recalculations = new Map();
  return ({ participantIds, groupingTotal }) => {
    const scope = participantIds?.length ? [...participantIds].sort((a, b) => a.localeCompare(b)).join('|') : '';
    const key = `${groupingTotal || ''}:${scope}`;
    if (!recalculations.has(key)) recalculations.set(key, recalculate({ participantIds, groupingTotal }));
    return recalculations.get(key);
  };
}

/** whether a directive is in play for a set of this size, purpose and phase; a gate that is not v1's is not reported */
function gate(directive: StandingsDirective, size: number, context: Context, headToHeadDisabled?: boolean) {
  const { when } = directive;
  if (when?.purposes && !(context.purpose && when.purposes.includes(context.purpose))) return 'SKIP';
  if (when?.phase && when.phase !== (context.phase ?? 'FINAL')) return 'SKIP';
  // head-to-head reads a pair; it is passed over, unreported, for any other size
  if (directive.attribute === 'headToHead') return size === 2 && !headToHeadDisabled ? 'APPLY' : 'SKIP';
  if (isNumeric(directive.maxParticipants) && size > (directive.maxParticipants ?? 0)) return 'EXCLUDE';
  if (isNumeric(directive.minParticipants) && size < (directive.minParticipants ?? 0)) return 'EXCLUDE';
  return 'APPLY';
}

function groupSubSort(params: SubSortArgs): SubSortResult {
  const { participantResults, disableHeadToHead, participantIds, context, from = 0 } = params;
  if (participantIds?.length === 1) return { order: [{ resolved: true, participantId: participantIds[0] }] };

  const { policy } = context;
  const excludedDirectives: StandingsDirective[] = [];
  const report: unknown[] = [];
  const headToHeadDisabled = disableHeadToHead && policy.honourDisableHeadToHead;
  const gates = policy.directives.map((directive) =>
    gate(directive, participantIds.length, context, headToHeadDisabled),
  );
  policy.directives.forEach((directive, index) => gates[index] === 'EXCLUDE' && excludedDirectives.push(directive));
  if (excludedDirectives.length) report.push({ excludedDirectives, participantIds });

  for (let index = from; index < policy.directives.length; index++) {
    if (gates[index] !== 'APPLY') continue;
    const directive = policy.directives[index];
    if (directive.attribute === 'headToHead') {
      const order = getHeadToHeadWinner({ participantIds, participantResults, mode: directive.mode });
      if (order) {
        const headToHeadWinner = order[0].participantId;
        return { order, report: [{ attribute: 'head2Head', participantIds, headToHeadWinner }] };
      }
      continue;
    }
    // a directive whose recalculation fails splits nothing and the next one is tried, as in v1
    const result = processDirective({ ...params, directive, index });
    report.push(result.report);
    if (result.order) return { order: result.order, report };
  }

  return terminal({ participantIds, context, report });
}

/** a set no directive splits (TerminalStep) */
function terminal({
  participantIds,
  context,
  report,
}: {
  participantIds: string[];
  context: Context;
  report: unknown[];
}) {
  const step = context.policy.terminal ?? 'ADJUDICATE';
  if (step === 'LOT') {
    const seed = context.lotSeed ?? '';
    const drawn = [...participantIds].sort(
      (a, b) => lotHash(`${seed}:${a}`) - lotHash(`${seed}:${b}`) || a.localeCompare(b),
    );
    report.push({ attribute: 'lot', seed, participantIds: drawn });
    return { order: drawn.map((participantId) => ({ resolved: true, participantId })), report };
  }
  const shared = step === 'SHARE' ? { shared: true } : {};
  return { order: participantIds?.map((participantId) => ({ participantId, ...shared })), report };
}

/**
 * FNV-1a, 32 bit: a stable, platform-independent number for a seeded draw. The seed reaches here from caller data, so it
 * is made a primitive string first: an object with a crafted `length` must not bound the loop.
 */
function lotHash(text: string) {
  let hash = 0x811c9dc5;
  // iterates the characters of a primitive string, so no caller-supplied `length` bounds the loop
  for (const character of String(text)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function processDirective(
  params: SubSortArgs & { directive: StandingsDirective; index: number },
): Partial<SubSortResult> {
  const { participantIds, context, directive, index } = params;
  const { attribute, reversed, idsFilter, groupTotals, disableHeadToHead } = directive;
  const outcome = context.recalculate({
    participantIds: idsFilter ? participantIds : undefined,
    groupingTotal: groupTotals ? attribute : undefined,
  });
  // an absent result set must not read as an empty group: no split, no report
  if (outcome.error) return {};
  const participantResults = outcome.participantResults ?? {};

  const groups = getGroups({ participantResults, participantIds, attribute });
  const report: unknown[] = [{ attribute, reversed, groups, idsFilter, groupTotals }];

  if (Object.keys(groups).length <= 1 || !participantIds.length) return { order: undefined, report };

  const parts = sortedGroups(groups, reversed);
  const subSort = (subGroupIds: string[], from: number) => {
    const result = groupSubSort({ participantResults, disableHeadToHead, participantIds: subGroupIds, context, from });
    report.push(...(result.report ?? []));
    return result.order;
  };

  const onSplit = context.policy.onSplit ?? 'RESTART';
  if (onSplit === 'EXTRACT_ONE') {
    const extracted = extractOne(parts, subSort);
    if (extracted) return { order: extracted, report };
  }
  // CONTINUE resumes after the directive that split, but re-applies a mini-league to the residue it leaves (A2)
  const resumeAt = onSplit === 'CONTINUE' ? index + (idsFilter ? 0 : 1) : 0;
  return { order: withSubGroups(parts.map((part) => subSort(part, resumeAt))), report };
}

/**
 * EXTRACT_ONE (A4): the leader of the top part is resolved and everyone else, the rest of the top part included, goes
 * back to the first directive. When the top part leaves no single leader, the split is used as RESTART would.
 */
function extractOne(parts: string[][], subSort: (ids: string[], from: number) => FinishingPosition[]) {
  const [top] = parts;
  const leader =
    top.length === 1 ? top[0] : subSort(top, 0).find((position, i) => i === 0 && position.resolved)?.participantId;
  if (!leader) return undefined;
  const rest = parts.flat().filter((participantId) => participantId !== leader);
  return withSubGroups([[{ resolved: true, participantId: leader }], subSort(rest, 0)]);
}

/**
 * RECORD: more wins over the other across every meeting decides; level records (1-1, or no meeting) do not split.
 * FIRST_VICTORY (K1, v1): any one victory decides, whichever participant is checked first.
 * Reverses `participantIds` IN PLACE when the second participant wins, as v1 does; the same array sits in earlier report
 * entries' `groups`, so the report shows the winner first there too.
 */
function getHeadToHeadWinner({
  participantIds,
  participantResults,
  mode = 'RECORD',
}: {
  participantIds: string[];
  participantResults: ParticipantResults;
  mode?: HeadToHeadMode;
}): FinishingPosition[] | undefined {
  if (!participantIds) return undefined;
  const [first, second] = participantIds;
  const winsOver = (a: string, b: string) => participantResults[a].victories.filter((id) => id === b).length;
  const firstWins = winsOver(first, second);
  const secondWins = winsOver(second, first);
  const firstAhead = mode === 'FIRST_VICTORY' ? firstWins > 0 : firstWins > secondWins;
  const secondAhead = mode === 'FIRST_VICTORY' ? !firstAhead && secondWins > 0 : secondWins > firstWins;
  if (firstAhead) return participantIds.map((participantId) => ({ resolved: true, participantId }));
  if (secondAhead) return participantIds.reverse().map((participantId) => ({ resolved: true, participantId }));
  return undefined;
}

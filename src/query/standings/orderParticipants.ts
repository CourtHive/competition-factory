import { getGroups } from '@Query/matchUps/roundRobinTally/getGroups';
import { instanceCount } from '@Tools/arrays';
import { isNumeric } from '@Tools/math';

// types
import type {
  FinishingPosition,
  ParticipantResults,
  Recalculate,
  StandingsDirective,
  StandingsPolicy,
} from './standingsTypes';

type OrderParticipantsArgs = {
  participantResults: ParticipantResults;
  policy: StandingsPolicy;
  /** recomputes results over a scope; the caller owns how (a group's matchUps, a season's) */
  recalculate: Recalculate;
  /** an organiser's order within a set no directive splits (v1 `setSubOrder`) */
  subOrderMap?: Record<string, number>;
};

type SubSortArgs = {
  participantResults: ParticipantResults;
  disableHeadToHead?: boolean;
  participantIds: string[];
  policy: StandingsPolicy;
  recalculate: Recalculate;
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
export function orderParticipants({ participantResults, policy, recalculate, subOrderMap }: OrderParticipantsArgs) {
  const report: unknown[] = [];
  const attribute = policy.primary;
  const orderedTallyGroups = getGroups({ participantResults, attribute });
  report.push({ attribute, groups: orderedTallyGroups });

  const sortedTallyGroups = sortedGroups(orderedTallyGroups, false);

  // One ordering reads one set of results under one policy, so a recalculation is decided by its grouping total and
  // its participant scope alone. An elimination draw ties hundreds of participants, and its sub-sorts asked for the
  // same unscoped recalculation hundreds of times: 809 times for one 512 draw.
  const memoised = memoise(recalculate);
  const sortedOrder = sortedTallyGroups.map((participantIds) => {
    const result = groupSubSort({ participantIds, participantResults, policy, recalculate: memoised });
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
      if (subOrderMap) finishingPosition.subOrder = subOrderMap[participantId];
    }
    finishingPosition.rankOrder = position;
    finishingPosition.groupOrder = position + (finishingPosition.subOrder || 1) - 1;
  }

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

function groupSubSort(params: SubSortArgs): SubSortResult {
  const { participantResults, disableHeadToHead, participantIds, policy } = params;
  if (participantIds?.length === 1) return { order: [{ resolved: true, participantId: participantIds[0] }] };

  const excludedDirectives: StandingsDirective[] = [];
  const report: unknown[] = [];
  let result: Partial<SubSortResult> | undefined;

  const headToHeadDisabled = disableHeadToHead && policy.honourDisableHeadToHead;
  const directives = policy.directives.filter((directive) => {
    // head-to-head reads a pair; it is passed over, unreported, for any other size
    if (directive.attribute === 'headToHead') return participantIds?.length === 2 && !headToHeadDisabled;
    const keep = !(isNumeric(directive.maxParticipants) && participantIds?.length > (directive.maxParticipants ?? 0));
    if (!keep) excludedDirectives.push(directive);
    return keep;
  });
  if (excludedDirectives.length) report.push({ excludedDirectives, participantIds });

  for (const directive of directives) {
    if (directive.attribute === 'headToHead') {
      const order = getHeadToHeadWinner({ participantIds, participantResults });
      if (order) {
        const headToHeadWinner = order[0].participantId;
        return { order, report: [{ attribute: 'head2Head', participantIds, headToHeadWinner }] };
      }
      continue;
    }
    // a directive whose recalculation fails splits nothing and the next one is tried, as in v1
    result = processDirective({ ...params, directive });
    report.push(result.report);
    if (result.order) return { order: result.order, report };
  }

  return { order: participantIds?.map((participantId) => ({ participantId })), report };
}

function processDirective(params: SubSortArgs & { directive: StandingsDirective }): Partial<SubSortResult> {
  const { participantIds, policy, recalculate, directive } = params;
  const { attribute, reversed, idsFilter, groupTotals, disableHeadToHead } = directive;
  const outcome = recalculate({
    participantIds: idsFilter ? participantIds : undefined,
    groupingTotal: groupTotals ? attribute : undefined,
  });
  // an absent result set must not read as an empty group: no split, no report
  if (outcome.error) return {};
  const participantResults = outcome.participantResults ?? {};

  const groups = getGroups({ participantResults, participantIds, attribute });
  const report: unknown[] = [{ attribute, reversed, groups, idsFilter, groupTotals }];

  if (Object.keys(groups).length <= 1 || !participantIds.length) return { order: undefined, report };

  const sortedOrder = sortedGroups(groups, reversed).map((subGroupIds) => {
    const result = groupSubSort({
      participantResults,
      disableHeadToHead,
      participantIds: subGroupIds,
      policy,
      recalculate,
    });
    report.push(...(result.report ?? []));
    return result.order;
  });

  return { order: withSubGroups(sortedOrder), report };
}

/**
 * FIRST_VICTORY (K1): one victory decides, whichever participant is checked first, not the record between them.
 * Reverses `participantIds` IN PLACE when the second participant won, as v1 does; the same array sits in earlier report
 * entries' `groups`, so the report shows the winner first there too.
 */
function getHeadToHeadWinner({
  participantIds,
  participantResults,
}: {
  participantIds: string[];
  participantResults: ParticipantResults;
}): FinishingPosition[] | undefined {
  if (!participantIds) return undefined;
  if (participantResults[participantIds[0]].victories.includes(participantIds[1])) {
    return participantIds.map((participantId) => ({ resolved: true, participantId }));
  } else if (participantResults[participantIds[1]].victories.includes(participantIds[0])) {
    return participantIds.reverse().map((participantId) => ({ resolved: true, participantId }));
  }
  return undefined;
}

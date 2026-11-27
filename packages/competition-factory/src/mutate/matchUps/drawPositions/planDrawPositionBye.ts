import { addPositionActionTelemetry } from '@Mutate/drawDefinitions/positionGovernor/addPositionActionTelemetry';
import { refuseNonForwardAdvance, byeTargetMatchUps, withdrawArrivalsByResult } from './assignDrawPositionBye';
import { modifyMatchUpNotice, modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { arrivalMovesOccupant, swapSideFacts } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { matchUpHoldsScheduling, releaseByeScheduling } from '@Mutate/matchUps/schedule/byeScheduling';
import { getDrawPositionSideNumber, getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { normalizeDrawPositions } from './normalizeDrawPositions';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { isDoubleExit, isExit } from '@Validators/isExit';
import { drawPositionFilled } from './drawPositionFilled';
import { findStructure } from '@Acquire/findStructure';
import { numericSort } from '@Tools/sorting';

// constants and types
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  DrawDefinition,
  DrawLink,
  Event,
  MatchUp,
  PositionAssignment,
  Structure,
  Tournament,
} from '@Types/tournamentTypes';
import {
  DRAW_POSITION_ACTIVE,
  DRAW_POSITION_ASSIGNED,
  LUCKY_DRAW_BYE_LIMIT,
  MATCHUP_HAS_SCHEDULING,
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_POSITION,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/**
 * ONE PUBLIC BYE PLACEMENT, PLANNED BEFORE IT WRITES.
 *
 * `assignDrawPositionBye` decides as it writes. It sets the BYE, writes the matchUp it lands in, and only then walks
 * the advancement, so a refusal found on the walk (a forward edge that resolves to an earlier round because the
 * record repeats a matchUpId, a missing target, a filled or active loser seat) was returned over a changed draw.
 *
 * Here the same walk runs first, against a DRAFT of the draw: the stored objects are read where nothing in this call
 * writes them, and a working copy stands in for each one this call does write. Every rule is asked in the order the
 * writer asks it, against the draw as it stands at that point of the writer's cascade. A nested placement reads a
 * fresh hydration of the draft, as the writer's own nested call hydrates the draw it has written so far.
 *
 * What the walk returns is a FINITE ORDERED LIST of bound operations on the stored objects: the seat's BYE, each
 * matchUp a BYE lands in, each advance, and the notices between them in the writer's order. Commit runs that list. It
 * does not recurse, resolve a matchUp by id, or ask a rule.
 *
 * THE PLANNED DOMAIN. Every placement whose walk meets only plain matchUps: no exit and no exit provenance on a
 * matchUp the walk writes or reads a carry from, a non-propagation placement, and no caller-supplied draw state. A walk
 * that meets anything else reports itself `unplanned`, and the caller keeps the existing writer for it.
 */

type Step = () => void;

type Draft = {
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  /** the stored object a working copy stands in for (itself when nothing has copied it) */
  original: <T extends object>(value: T) => T;
  /** the working copy of a stored matchUp, made on the first write */
  writableMatchUp: (matchUp: MatchUp) => MatchUp;
  /** the working copy of a stored assignment in a (working) assignments array, made on the first write */
  writableAssignment: (assignments: PositionAssignment[], index: number) => PositionAssignment;
  /** the draft's object for a stored (or working) one: its working copy once written */
  current: <T extends object>(value: T) => T;
  /** the top-level structure holding `structureId`, copied so its arrays can take working copies */
  ensureStructure: (structureId?: string) => void;
};

type Plan = {
  draft: Draft;
  steps: Step[];
  /** the walk met a shape outside the planned domain */
  unplanned?: string;
  /** the placed seat's hydration of the draw, taken before anything was drafted (absent where an assignment was appended) */
  seatHydration?: HydratedMatchUp[];
  seatAsked?: boolean;
  real: { drawDefinition: DrawDefinition; tournamentRecord?: Tournament };
};

function createDraft(drawDefinition: DrawDefinition, base: MatchUpsMap): Draft {
  const working: DrawDefinition = { ...drawDefinition, structures: [...(drawDefinition.structures ?? [])] };
  const matchUpsMap: MatchUpsMap = { drawMatchUps: [...base.drawMatchUps], mappedMatchUps: { ...base.mappedMatchUps } };
  const originals = new Map<object, object>();
  const copies = new Map<object, object>();
  const copiedStructures = new Set<string>();

  // the top-level structure an id names, itself or the container holding it
  const topLevelId = (structureId?: string) =>
    structureId &&
    drawDefinition.structures?.find(
      (structure) =>
        structure.structureId === structureId ||
        structuresOf(structure)?.some((item) => item.structureId === structureId),
    )?.structureId;

  const copyStructure = (structure: Structure): Structure => {
    const items = structuresOf(structure);
    const matchUps = matchUpsOf(structure);
    const assignments = positionAssignmentsOf(structure);
    const copy = {
      ...structure,
      ...(matchUps ? { matchUps: [...matchUps] } : {}),
      ...(assignments ? { positionAssignments: [...assignments] } : {}),
      ...(items ? { structures: items.map(copyStructure) } : {}),
    } as Structure;
    originals.set(copy, structure);
    copies.set(structure, copy);
    const entry = matchUpsMap.mappedMatchUps[structure.structureId];
    if (entry && matchUps) matchUpsMap.mappedMatchUps[structure.structureId] = { ...entry, matchUps: matchUpsOf(copy) };
    return copy;
  };

  const ensureStructure = (structureId?: string) => {
    const topId = topLevelId(structureId);
    if (!topId || copiedStructures.has(topId)) return;
    const index = working.structures?.findIndex((structure) => structure.structureId === topId) ?? -1;
    if (index < 0 || !working.structures) return;
    working.structures[index] = copyStructure(working.structures[index]);
    copiedStructures.add(topId);
  };

  // the structure whose map entry holds a stored matchUp, read from the call's map
  const holderOf = (stored: MatchUp) =>
    Object.entries(base.mappedMatchUps ?? {}).find(([, entry]) =>
      (entry.matchUps as MatchUp[] | undefined)?.includes(stored),
    )?.[0];

  const replaceInDraw = (stored: MatchUp, copy: MatchUp) => {
    const at = base.drawMatchUps.indexOf(stored);
    if (at >= 0) matchUpsMap.drawMatchUps[at] = copy;
    originals.set(copy, stored);
    copies.set(stored, copy);
  };

  return {
    drawDefinition: working,
    matchUpsMap,
    ensureStructure,
    original: <T extends object>(value: T) => (originals.get(value) ?? value) as T,
    current: <T extends object>(value: T) => (copies.get(originals.get(value) ?? value) ?? value) as T,
    writableMatchUp(matchUp) {
      const stored = (originals.get(matchUp) ?? matchUp) as MatchUp;
      const existing = copies.get(stored) as MatchUp | undefined;
      if (existing) return existing;
      const structureId = holderOf(stored);
      ensureStructure(structureId);
      const structure = structureId ? findStructure({ drawDefinition: working, structureId }).structure : undefined;
      const matchUps = matchUpsOf(structure);
      const index = matchUps?.indexOf(stored) ?? -1;
      // SHALLOW: what a planned step writes is the matchUp's own fields (a new array for its positions) and, on a release,
      // its schedule, which is copied; a plain matchUp's provenance is never written, and its lines are never written
      const copy: MatchUp = { ...stored, ...(stored.schedule ? { schedule: { ...stored.schedule } } : {}) };
      if (matchUps && index >= 0) matchUps[index] = copy;
      replaceInDraw(stored, copy);
      return copy;
    },
    writableAssignment(assignments, index) {
      const current = assignments[index];
      if (originals.has(current)) return current;
      const copy = { ...current };
      assignments[index] = copy;
      originals.set(copy, current);
      copies.set(current, copy);
      return copy;
    },
  };
}

// ############################ the walk ############################

type PlanByeArgs = {
  byeFromPropagation?: boolean;
  provisionalPositioning?: boolean;
  preserveScheduling?: boolean;
  isPositionAction?: boolean;
  drawPositionsInactive?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  drawPosition: number;
  structureId?: string;
  event?: Event;
};

/** the planned BYE placement, or `undefined` where the walk leaves the planned domain */
export function planDrawPositionBye(
  params: PlanByeArgs,
):
  | { result: ResultType; commit?: () => void; unplanned?: undefined }
  | { unplanned: string; seatHydration?: HydratedMatchUp[] } {
  const { drawDefinition, tournamentRecord } = params;
  if (!drawDefinition) return { result: { error: MISSING_DRAW_DEFINITION } };
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const plan: Plan = {
    draft: createDraft(drawDefinition, matchUpsMap),
    real: { drawDefinition, tournamentRecord },
    steps: [],
  };
  const result = planBye(plan, { ...params, drawDefinition: plan.draft.drawDefinition });
  if (plan.unplanned) return { unplanned: plan.unplanned, seatHydration: plan.seatHydration };
  if (result.error) return { result };
  const steps = plan.steps;
  return {
    result,
    commit: () => {
      for (const step of steps) step();
    },
  };
}

/** `plain`: no exit and no exit provenance, the only matchUps the walk plans through */
function plain(matchUp: MatchUp): boolean {
  return !isExit(matchUp.matchUpStatus) && !isDoubleExit(matchUp.matchUpStatus) && !getSideExitProvenance({ matchUp });
}

/** as `assignDrawPositionBye`, against the draft */
function planBye(plan: Plan, params: PlanByeArgs & { drawDefinition: DrawDefinition }): ResultType {
  const { draft } = plan;
  const { drawDefinition, drawPosition } = params;

  const structure = findStructure({ drawDefinition, structureId: params.structureId }).structure;
  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  const structureId = params.structureId ?? structure.structureId;
  draft.ensureStructure(structureId);
  // the working structure, which now holds working arrays
  const workingStructure = findStructure({ drawDefinition, structureId }).structure as Structure;

  pushGlobalLog({ method: STACK, color: 'cyan', drawPosition });

  const seat = seatRefusal(plan, { ...params, structureId }, workingStructure);
  if (seat.done) return seat.done;
  // the placed seat's own (the first asked): its hydration reads the record as it stands, for the writer the caller
  // keeps where the walk is unplanned
  if (!plan.seatAsked) {
    plan.seatAsked = true;
    plan.seatHydration = seat.inContextDrawMatchUps;
  }

  const { tournamentRecord, provisionalPositioning, preserveScheduling, isPositionAction, event } = params;
  const appliedPolicies = getAppliedPolicies({ tournamentRecord, drawDefinition, event }).appliedPolicies ?? {};
  const matchUpsMap = draft.matchUpsMap;
  const inContextDrawMatchUps = seat.inContextDrawMatchUps ?? hydrate(plan, drawDefinition);
  const { matchUps } = getAllStructureMatchUps({
    matchUpFilters: { isCollectionMatchUp: false },
    structure: workingStructure,
    provisionalPositioning,
    drawDefinition,
    matchUpsMap,
  });

  const byeTargets = byeTargetMatchUps({ structure: workingStructure, matchUps, drawPosition });
  if (
    isPositionAction &&
    preserveScheduling === undefined &&
    byeTargets.some((m) => matchUpHoldsScheduling({ matchUp: m }))
  ) {
    return decorateResult({
      info: 'assigning a BYE to a scheduled matchUp requires preserveScheduling: true | false',
      result: { error: MATCHUP_HAS_SCHEDULING },
      stack: STACK,
    });
  }

  // the seat's BYE: the first write
  planSeatBye(plan, workingStructure, seat.positionAssignments, seat.appended, drawPosition);

  const realStructure = draft.original(workingStructure);
  const finish = () => {
    plan.steps.push(() =>
      modifyPositionAssignmentsNotice({
        tournamentId: tournamentRecord?.tournamentId,
        drawDefinition: plan.real.drawDefinition,
        structure: realStructure,
        event,
      }),
    );
    if (isPositionAction) {
      const positionAction = { removedParticipantId: undefined, drawPosition, structureId, name: STACK };
      plan.steps.push(() =>
        addPositionActionTelemetry({ appliedPolicies, drawDefinition: plan.real.drawDefinition, positionAction }),
      );
    }
    return decorateResult({ result: { ...SUCCESS }, stack: STACK });
  };

  if (workingStructure.structureType === CONTAINER) {
    for (const matchUp of matchUps) {
      if (!matchUp.drawPositions?.includes(drawPosition)) continue;
      // `assignRoundRobinBYE` is handed no event
      if (!planMatchUpBye(plan, { matchUp, preserveScheduling, tournamentRecord })) return {};
    }
    return finish();
  }

  const onward = planFurthest(plan, { ...params, inContextDrawMatchUps, matchUps });
  if (plan.unplanned) return {};
  if (onward?.error) return onward;
  return finish();
}

const STACK = 'assignDrawPositionBye';

/**
 * The refusals asked of the seat itself, in the writer's order; an absent assignment is added to the draft's array as
 * the writer adds it, before the refusals after it
 */
function seatRefusal(
  plan: Plan,
  params: PlanByeArgs & { drawDefinition: DrawDefinition; structureId: string },
  workingStructure: Structure,
): {
  done?: ResultType;
  positionAssignments: PositionAssignment[];
  appended?: PositionAssignment;
  inContextDrawMatchUps?: HydratedMatchUp[];
} {
  const { drawDefinition, drawPosition, structureId } = params;
  const { positionAssignments } = getPositionAssignments({ structure: workingStructure });

  const currentAssignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);
  if (currentAssignment?.bye) return { done: { ...SUCCESS }, positionAssignments };

  if (isLuckyBasedDraw(drawDefinition.drawType)) {
    const existingByes = positionAssignments?.filter((a) => a.bye && a.drawPosition !== drawPosition);
    if (existingByes?.length)
      return { done: decorateResult({ result: { error: LUCKY_DRAW_BYE_LIMIT }, stack: STACK }), positionAssignments };
  }

  // a propagation placement never reaches the planner (the public wrapper keeps the writer for it), and no loserMatchUp
  // reaches a public placement or its nested ones, so the topology inference is false: this is no propagation placement

  // ONE HYDRATION for the activity check and the walk: the writer hydrates the draw for each, with nothing written
  // between them (an absent assignment appended after the check is hydrated again, below)
  const inContextDrawMatchUps = params.drawPositionsInactive ? undefined : hydrate(plan, drawDefinition);
  const drawPositionIsActive =
    inContextDrawMatchUps &&
    getStructureDrawPositionProfiles({
      drawDefinition,
      structureId,
      inContextDrawMatchUps,
    }).activeDrawPositions?.includes(drawPosition);
  if (drawPositionIsActive) return { done: { error: DRAW_POSITION_ACTIVE }, positionAssignments };

  let positionAssignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);
  let created: PositionAssignment | undefined;
  if (!positionAssignment) {
    // a container's assignments are read as a flattened copy: an entry added there is stored nowhere
    if (structuresOf(workingStructure))
      return { done: unplanned(plan, 'container position with no assignment'), positionAssignments };
    created = { drawPosition };
    positionAssignments.push(created);
    positionAssignment = created;
  }

  // a BYE already here returned above: the seat found is the one asked first, or an empty one appended
  const { filled } = drawPositionFilled(positionAssignment);
  if (filled)
    return { done: decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, stack: STACK }), positionAssignments };
  return { positionAssignments, appended: created, inContextDrawMatchUps: created ? undefined : inContextDrawMatchUps };
}

/** the seat's assignment takes the BYE (no propagation marker); an absent one is appended to the stored array first */
function planSeatBye(
  plan: Plan,
  workingStructure: Structure,
  positionAssignments: PositionAssignment[],
  created: PositionAssignment | undefined,
  drawPosition: number,
) {
  const { draft } = plan;
  if (created) {
    const realAssignments = getPositionAssignments({ structure: draft.original(workingStructure) }).positionAssignments;
    const stored: PositionAssignment = { drawPosition };
    plan.steps.push(() => realAssignments.push(stored));
    // the draft's new entry stands in for `stored`
    createdStored.set(created, stored);
  }
  const write = (into: PositionAssignment) => {
    into.bye = true;
    delete into.byeFromPropagation;
  };
  positionAssignments.forEach((assignment, index) => {
    if (assignment.drawPosition !== drawPosition) return;
    const target = assignment === created ? created : draft.writableAssignment(positionAssignments, index);
    write(target);
    const stored = storedOf(plan, target);
    plan.steps.push(() => write(stored));
  });
}

/** the matchUp at the seat's furthest advancement becomes a BYE, results awarded to the seat go, then the walk on */
function planFurthest(
  plan: Plan,
  params: PlanByeArgs & {
    inContextDrawMatchUps: HydratedMatchUp[];
    drawDefinition: DrawDefinition;
    matchUps: MatchUp[];
  },
): ResultType | undefined {
  const { inContextDrawMatchUps, matchUps, drawPosition, preserveScheduling, tournamentRecord, event } = params;
  const { byeFromPropagation, drawDefinition } = params;
  const { roundProfile, roundMatchUps } = getRoundMatchUps({ matchUps });
  const roundNumbers =
    roundProfile &&
    Object.keys(roundProfile)
      .map((roundNumber) => Number.parseInt(roundNumber))
      .reverse();
  const roundNumber = roundNumbers?.find((roundNumber) =>
    roundProfile?.[roundNumber].drawPositions?.includes(drawPosition),
  );
  const matchUp = roundNumber
    ? roundMatchUps?.[roundNumber].find(({ drawPositions }) => drawPositions?.includes(drawPosition))
    : undefined;

  // a displaced carrier's carry: none, as this is no propagation placement
  if (matchUp && !planMatchUpBye(plan, { matchUp, preserveScheduling, tournamentRecord, event })) return undefined;

  // `correctResultsAwardedToTheBye`
  for (const chainMatchUp of matchUps ?? []) {
    if (chainMatchUp.matchUpId === matchUp?.matchUpId) continue;
    if (!chainMatchUp.winningSide || !chainMatchUp.drawPositions?.includes(drawPosition)) continue;
    const inContextChainMatchUp = inContextDrawMatchUps.find((m) => m.matchUpId === chainMatchUp.matchUpId);
    const sideNumber = inContextChainMatchUp?.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber;
    if (sideNumber !== chainMatchUp.winningSide) continue;
    if (!planMatchUpBye(plan, { matchUp: chainMatchUp, preserveScheduling, tournamentRecord, event })) return undefined;
  }

  if (!matchUp) return undefined;
  // read from the draft: the BYE written above leaves the positions as they were
  const drawPositionToAdvance = plan.draft
    .current(matchUp)
    .drawPositions?.find((position) => position !== drawPosition);
  if (drawPositionToAdvance) {
    return planAdvance(plan, {
      matchUpId: matchUp.matchUpId,
      inContextDrawMatchUps,
      drawPositionToAdvance,
      byeFromPropagation,
      preserveScheduling,
      tournamentRecord,
      drawDefinition,
    });
  }
  if (roundNumber && roundNumber > (getInitialRoundNumber({ drawPosition, matchUps }).initialRoundNumber ?? 0)) {
    return planByeToLoserTarget(plan, {
      inContextDrawMatchUps,
      byeFromPropagation,
      preserveScheduling,
      tournamentRecord,
      drawDefinition,
      matchUp,
      event,
    });
  }
  return undefined;
}

/** the draft in context, as the writer's own `getAllDrawMatchUps` reads the draw it has written so far */
function hydrate(plan: Plan, drawDefinition: DrawDefinition): HydratedMatchUp[] {
  const matchUpsMap = plan.draft.matchUpsMap;
  return getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
}

function unplanned(plan: Plan, reason: string): ResultType {
  plan.unplanned ??= reason;
  return {};
}

const createdStored = new WeakMap<object, object>();
function storedOf<T extends object>(plan: Plan, working: T): T {
  return (createdStored.get(working) as T) ?? plan.draft.original(working);
}

/** `setMatchUpStatusBYE` on a plain matchUp; false where the matchUp is not plain */
function planMatchUpBye(
  plan: Plan,
  {
    preserveScheduling,
    tournamentRecord,
    matchUp,
    event,
  }: { preserveScheduling?: boolean; tournamentRecord?: Tournament; matchUp: MatchUp; event?: Event },
): boolean {
  const current = plan.draft.current(matchUp);
  if (getSideExitProvenance({ matchUp: current })) {
    unplanned(plan, 'exit provenance on a BYE matchUp');
    return false;
  }
  const write = (into: MatchUp) => {
    Object.assign(into, { matchUpStatus: BYE, score: undefined, winningSide: undefined });
    withdrawArrivalsByResult(into);
    if (preserveScheduling === false) releaseByeScheduling({ matchUp: into });
  };
  write(plan.draft.writableMatchUp(current));
  const stored = plan.draft.original(current);
  plan.steps.push(() => {
    write(stored);
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: event?.eventId,
      context: 'setMatchUpStatusBye',
      drawDefinition: plan.real.drawDefinition,
      matchUp: stored,
      event,
    });
  });
  return true;
}

type PlanAdvanceArgs = {
  inContextDrawMatchUps: HydratedMatchUp[];
  byeFromPropagation?: boolean;
  drawPositionToAdvance: number;
  preserveScheduling?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpId: string;
  event?: Event;
};

/** as `advanceDrawPosition` */
function planAdvance(plan: Plan, args: PlanAdvanceArgs): ResultType {
  const { byeFromPropagation, drawPositionToAdvance, inContextDrawMatchUps, preserveScheduling } = args;
  const { tournamentRecord, drawDefinition, matchUpId, event } = args;
  const stack = 'advanceDrawPosition';
  pushGlobalLog({ method: stack, color: 'cyan', drawPositionToAdvance });
  const matchUpsMap = plan.draft.matchUpsMap;

  const matchUp = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  const inContextMatchUp = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  const structureId = inContextMatchUp?.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  const { positionAssignments } = getPositionAssignments({ structure });

  const byeAssignedDrawPositions = positionAssignments
    ?.filter((assignment) => assignment.bye)
    .map((assignment) => assignment.drawPosition);

  const losingDrawPosition = matchUp?.drawPositions?.find((drawPosition) => drawPosition !== drawPositionToAdvance);
  const losingDrawPositionIsBye = losingDrawPosition && byeAssignedDrawPositions?.includes(losingDrawPosition);

  const targetData = positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId });
  if (targetData.error) return decorateResult({ result: targetData, stack });
  const {
    targetLinks: { loserTargetLink },
    targetMatchUps: { loserMatchUp, winnerMatchUp, loserTargetDrawPosition },
  } = targetData;

  const isLuckyDraw = isLuckyBasedDraw(drawDefinition?.drawType);
  const isPreFeedRound = (() => {
    const structureMatchUps = matchUpsOf(structure);
    if (!isLuckyDraw || !matchUp?.roundNumber || !structureMatchUps) return false;
    const roundMatchUpCount = structureMatchUps.filter((m) => m.roundNumber === matchUp.roundNumber).length;
    return roundMatchUpCount % 2 !== 0;
  })();

  if (winnerMatchUp && winnerMatchUp.structureId === structure?.structureId && (!isLuckyDraw || !isPreFeedRound)) {
    // thrown as the writer throws it, and now before anything is written
    refuseNonForwardAdvance(inContextMatchUp, winnerMatchUp.matchUpId, inContextDrawMatchUps);
    if (losingDrawPositionIsBye && inContextMatchUp && !byeAssignedDrawPositions?.includes(drawPositionToAdvance)) {
      // `takeBackHoldersBye`: a holder's BYE already standing in the next matchUp is an exit propagation's
      const stored = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === winnerMatchUp.matchUpId);
      if (stored?.drawPositions?.includes(losingDrawPosition)) {
        const arrivalSideNumber = getDrawPositionSideNumber({
          matchUp: { ...stored, sides: undefined },
          drawPosition: losingDrawPosition,
          drawDefinition,
          structureId,
        });
        if (arrivalSideNumber) return unplanned(plan, 'a holder BYE to take back');
      }
    }
    planAdvanceWinner(plan, {
      sourceRoundPosition: matchUp?.roundPosition,
      byeFromPropagation,
      drawPositionToAdvance,
      inContextDrawMatchUps,
      preserveScheduling,
      tournamentRecord,
      drawDefinition,
      winnerMatchUp,
      event,
    });
    if (plan.unplanned) return {};
  }

  if (
    loserTargetLink &&
    loserMatchUp &&
    loserTargetDrawPosition !== undefined &&
    losingDrawPositionIsBye &&
    loserMatchUp.structureId !== structure?.structureId
  ) {
    if (loserMatchUp.roundNumber === 1) {
      const result = planBye(plan, {
        byeFromPropagation,
        structureId: loserTargetLink.target.structureId,
        drawPosition: loserTargetDrawPosition,
        preserveScheduling,
        tournamentRecord,
        drawDefinition,
        event,
      });
      if (plan.unplanned) return {};
      if (result.error) return result;
    } else {
      planFedBye(plan, {
        byeFromPropagation,
        loserTargetDrawPosition,
        preserveScheduling,
        tournamentRecord,
        loserTargetLink,
        drawDefinition,
        loserMatchUp,
        event,
      });
      if (plan.unplanned) return {};
    }
  }

  return { ...SUCCESS };
}

type PlanAdvanceWinnerArgs = {
  inContextDrawMatchUps: HydratedMatchUp[];
  byeFromPropagation?: boolean;
  drawPositionToAdvance: number;
  preserveScheduling?: boolean;
  tournamentRecord?: Tournament;
  sourceRoundPosition?: number;
  drawDefinition: DrawDefinition;
  winnerMatchUp: HydratedMatchUp;
  event?: Event;
};

/** as `advanceWinner`, on a plain matchUp: its exit branches are left to the writer */
function planAdvanceWinner(plan: Plan, args: PlanAdvanceWinnerArgs): ResultType | undefined {
  const { byeFromPropagation, drawPositionToAdvance, inContextDrawMatchUps, preserveScheduling } = args;
  const { sourceRoundPosition, tournamentRecord, drawDefinition, winnerMatchUp, event } = args;
  const stack = 'advanceWinner';
  const matchUpsMap = plan.draft.matchUpsMap;
  const noContextWinnerMatchUp = matchUpsMap.drawMatchUps.find(
    (matchUp) => matchUp.matchUpId === winnerMatchUp.matchUpId,
  ) as MatchUp;
  const inContextMatchUp = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === winnerMatchUp.matchUpId);
  const structureId = inContextMatchUp?.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  const { positionAssignments } = getPositionAssignments({ structure });
  const drawPositionToAdvanceAssigment = positionAssignments?.find(
    ({ drawPosition }) => drawPosition === drawPositionToAdvance,
  );
  const drawPositionToAdvanceIsBye = drawPositionToAdvanceAssigment?.bye;
  const existingDrawPositions = noContextWinnerMatchUp.drawPositions?.filter(Boolean);

  if ((existingDrawPositions?.length ?? 0) > 1 && drawPositionToAdvanceIsBye) {
    return decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, stack });
  }
  const pairedDrawPosition = existingDrawPositions?.find((drawPosition) => drawPosition !== drawPositionToAdvance);

  let drawPositionAssigned = false;
  const twoDrawPositions = [
    ...(noContextWinnerMatchUp.drawPositions ?? []).filter(Boolean),
    undefined,
    undefined,
  ].slice(0, 2);
  const drawPositions = twoDrawPositions
    .map((position) => {
      if ((!position && !drawPositionAssigned) || position === drawPositionToAdvance) {
        drawPositionAssigned = true;
        return drawPositionToAdvance;
      } else {
        return position;
      }
    })
    .sort(numericSort);
  if (!drawPositionAssigned) return decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, stack });

  // THE PLANNED DOMAIN: every branch before the ordinary advance reads an exit on this matchUp, or (through a BYE
  // matchUp) a carried exit on the feeder the position comes from (`stampCarriedExitOnArrival`)
  if (!plain(noContextWinnerMatchUp)) return unplanned(plan, 'an exit where the position advances');
  if (noContextWinnerMatchUp.matchUpStatus === BYE) {
    const isFeeder = (candidate: MatchUp) =>
      candidate.roundNumber === (winnerMatchUp.roundNumber ?? 0) - 1 &&
      (sourceRoundPosition ? candidate.roundPosition === sourceRoundPosition : true) &&
      !!candidate.drawPositions?.includes(drawPositionToAdvance);
    const storedFeeder = structureId ? matchUpsMap.mappedMatchUps?.[structureId]?.matchUps?.find(isFeeder) : undefined;
    const feeder =
      storedFeeder ??
      inContextDrawMatchUps.find((candidate) => candidate.structureId === structureId && isFeeder(candidate));
    if (getSideExitProvenance({ matchUp: feeder })) return unplanned(plan, 'a carry past a BYE');
  }

  const pairedDrawPositionIsBye = positionAssignments?.find(
    ({ drawPosition }) => drawPosition === pairedDrawPosition,
  )?.bye;
  const drawPositionIsBye = drawPositionToAdvanceAssigment?.bye;

  const matchUpStatus =
    drawPositionIsBye || pairedDrawPositionIsBye
      ? BYE
      : // `standingExitStatus` reads the matchUp's exit provenance, which a plain matchUp has none of
        TO_BE_PLAYED;

  const sideChanged = arrivalMovesOccupant({
    structureId: winnerMatchUp?.structureId,
    matchUp: noContextWinnerMatchUp,
    drawDefinition,
    drawPositions,
  });
  const values = {
    matchUpStatus,
    score: undefined,
    winningSide: undefined,
    drawPositions: normalizeDrawPositions(drawPositions),
  };
  const release = matchUpStatus === BYE && preserveScheduling === false;
  const write = (into: MatchUp) => {
    if (sideChanged) swapSideFacts(into, false);
    Object.assign(into, { ...values, drawPositions: [...values.drawPositions] });
    if (release) releaseByeScheduling({ matchUp: into });
  };
  write(plan.draft.writableMatchUp(noContextWinnerMatchUp));
  const stored = plan.draft.original(noContextWinnerMatchUp);
  pushGlobalLog({ method: stack, color: 'brightyellow', pairedDrawPositionIsBye, drawPositionIsBye });
  plan.steps.push(() => {
    write(stored);
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      matchUp: stored,
      eventId: event?.eventId,
      event,
      context: stack,
      drawDefinition: plan.real.drawDefinition,
    });
  });

  if (pairedDrawPositionIsBye || drawPositionIsBye) {
    const advancingDrawPosition = pairedDrawPositionIsBye ? drawPositionToAdvance : pairedDrawPosition;
    if (advancingDrawPosition) {
      // as the writer: no propagation marker and no event on the onward advance
      planAdvance(plan, {
        drawPositionToAdvance: advancingDrawPosition,
        matchUpId: winnerMatchUp.matchUpId,
        inContextDrawMatchUps,
        preserveScheduling,
        tournamentRecord,
        drawDefinition,
      });
    } else if (drawPositionIsBye) {
      const result = planByeToLoserTarget(plan, {
        matchUp: winnerMatchUp,
        byeFromPropagation,
        inContextDrawMatchUps,
        preserveScheduling,
        tournamentRecord,
        drawDefinition,
        event,
      });
      if (result?.error) return result;
    }
  }
  return undefined;
}

/** as `assignByeToLoserTarget` */
function planByeToLoserTarget(
  plan: Plan,
  args: {
    inContextDrawMatchUps: HydratedMatchUp[];
    byeFromPropagation?: boolean;
    preserveScheduling?: boolean;
    tournamentRecord?: Tournament;
    drawDefinition: DrawDefinition;
    matchUp: MatchUp | HydratedMatchUp;
    event?: Event;
  },
): ResultType | undefined {
  const { byeFromPropagation, inContextDrawMatchUps, preserveScheduling, tournamentRecord, drawDefinition } = args;
  const { matchUp, event } = args;
  const targetData = positionTargets({ matchUpId: matchUp.matchUpId, inContextDrawMatchUps, drawDefinition });
  if (targetData.error) return decorateResult({ result: targetData, stack: 'assignByeToLoserTarget' });
  const {
    targetLinks: { loserTargetLink },
    targetMatchUps: { loserMatchUp, loserTargetDrawPosition },
  } = targetData;
  if (!loserTargetLink || !loserMatchUp?.drawPositions || loserTargetDrawPosition === undefined) return { ...SUCCESS };

  if (loserMatchUp.feedRound) {
    // `assignByeToLoserTarget` hands the fed placement no event
    return planFedBye(plan, {
      byeFromPropagation,
      loserTargetDrawPosition,
      preserveScheduling,
      tournamentRecord,
      loserTargetLink,
      drawDefinition,
      loserMatchUp,
    });
  }

  const sourceStructureRoundPosition = matchUp.roundPosition ?? 0;
  const targetDrawPositionIndex = 1 - (sourceStructureRoundPosition % 2);
  const targetDrawPosition = getSideDrawPosition({
    structureId: loserTargetLink.target.structureId,
    sideNumber: targetDrawPositionIndex + 1,
    matchUp: loserMatchUp,
    drawDefinition,
  });
  if (!targetDrawPosition)
    return decorateResult({ result: { error: MISSING_DRAW_POSITION }, stack: 'advanceByeToLoserMatchUp' });

  return planBye(plan, {
    byeFromPropagation,
    structureId: loserTargetLink.target.structureId,
    drawPosition: targetDrawPosition,
    preserveScheduling,
    tournamentRecord,
    drawDefinition,
    event,
  });
}

/** as `assignFedDrawPositionBye` */
function planFedBye(
  plan: Plan,
  args: {
    byeFromPropagation?: boolean;
    loserTargetDrawPosition: number;
    preserveScheduling?: boolean;
    tournamentRecord?: Tournament;
    drawDefinition: DrawDefinition;
    loserMatchUp: HydratedMatchUp;
    loserTargetLink: DrawLink;
    event?: Event;
  },
): ResultType | undefined {
  const { byeFromPropagation, loserTargetDrawPosition, preserveScheduling, tournamentRecord } = args;
  const { loserTargetLink, drawDefinition, loserMatchUp, event } = args;
  pushGlobalLog({ method: 'assignFedDrawPositionBye', color: 'cyan', loserTargetDrawPosition });
  const loserStructureMatchUps = plan.draft.matchUpsMap.mappedMatchUps[loserMatchUp.structureId].matchUps;
  const { initialRoundNumber } = getInitialRoundNumber({
    drawPosition: loserTargetDrawPosition,
    matchUps: loserStructureMatchUps,
  });
  if (initialRoundNumber === loserMatchUp.roundNumber) {
    const result = planBye(plan, {
      byeFromPropagation,
      structureId: loserTargetLink.target.structureId,
      drawPosition: loserTargetDrawPosition,
      preserveScheduling,
      tournamentRecord,
      drawDefinition,
      event,
    });
    if (result.error) return result;
  }
  return undefined;
}

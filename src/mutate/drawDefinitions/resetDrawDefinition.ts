import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { normalizeDrawPositions } from '@Mutate/matchUps/drawPositions/normalizeDrawPositions';
import { clearSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { removeExtension } from '@Mutate/extensions/removeExtension';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';

// constants and types
import { MAIN, QUALIFYING, VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DISABLE_LINKS, DRAFT_STATE, POSITION_ACTIONS } from '@Constants/extensionConstants';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { BYE } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { TimeItem } from '@Types/tournamentTypes';
import {
  ASSIGN_COURT,
  ASSIGN_VENUE,
  ASSIGN_OFFICIAL,
  COURT_ANNOTATION,
  SCHEDULED_DATE,
  SCHEDULED_TIME,
  ALLOCATE_COURTS,
  COURT_ORDER,
} from '@Constants/timeItemConstants';

export function resetDrawDefinition({ tournamentRecord, removeScheduling, removeAssignments, drawDefinition, event }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const isLuckyDraw = isLuckyBasedDraw(drawDefinition.drawType);
  const matchUpsMap = getMatchUpsMap({ drawDefinition });

  const getRawMatchUp = (matchUpId) => matchUpsMap?.drawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

  for (const structure of drawDefinition.structures ?? []) {
    const { stage } = structure;

    if (stage === VOLUNTARY_CONSOLATION) {
      resetVoluntaryConsolationStructure(structure);
      continue;
    }

    resetStructureAssignments({ structure, isLuckyDraw, removeAssignments });

    resetStructureMatchUps({
      removeScheduling,
      tournamentRecord,
      drawDefinition,
      getRawMatchUp,
      isLuckyDraw,
      matchUpsMap,
      structure,
      removeAssignments,
      event,
    });
  }

  // Remove all VOLUNTARY_CONSOLATION entries
  if (drawDefinition.entries?.length) {
    drawDefinition.entries = drawDefinition.entries.filter((entry) => entry.entryStage !== VOLUNTARY_CONSOLATION);
  }

  drawDefinition.extensions = drawDefinition.extensions.filter(
    (extension) => extension.name !== POSITION_ACTIONS && extension.name !== DRAFT_STATE,
  );
  // CODES: also wipe the first-class draftState if present
  delete drawDefinition.draftState;

  // `disableLinks` marks a drawPosition whose assignment was cleared BY HAND, so link positioning
  // must not feed it again. A reset returns the draw to its pre-play state, which makes that marker
  // both meaningless and harmful: `getTargetMatchUp` returns `disabledDrawPosition` for such a
  // position, so a stale flag silently blocks progression through it for the life of the draw.
  //
  // Cleared for EVERY structure, after the per-stage branches above, because those branches reach
  // assignments by different routes — the lucky-draw playoff path replaces the array wholesale, the
  // non-lucky path maps over it deleting only `participantId`, and VOLUNTARY_CONSOLATION has its own
  // reset. A single pass is easier to prove complete than three.
  for (const structure of drawDefinition.structures ?? []) {
    for (const assignment of structure.positionAssignments ?? []) {
      // not gated on the schema write mode: the mode decides whether an attribute is WRITTEN, and
      // must never decide whether stale state is removed. Both representations go.
      delete assignment.disableLinks;
      if (Array.isArray(assignment.extensions)) removeExtension({ element: assignment, name: DISABLE_LINKS });
    }
  }

  const structureIds = (drawDefinition.structures ?? []).map(({ structureId }) => structureId);

  modifyDrawNotice({ drawDefinition, structureIds });

  return { ...SUCCESS };
}

function resetVoluntaryConsolationStructure(structure) {
  structure.matchUps = [];
  if (structure.positionAssignments) {
    structure.positionAssignments = structure.positionAssignments.map((a) => {
      delete a.participantId;
      return a;
    });
  }
  structure.seedAssignments = [];
}

function resetStructureAssignments({ structure, isLuckyDraw, removeAssignments }) {
  const { positionAssignments, stage, stageSequence } = structure;
  const isMainOrQualifyingFirst = stageSequence === 1 && [QUALIFYING, MAIN].includes(stage);

  if (isLuckyDraw && positionAssignments) {
    resetLuckyDrawAssignments({ structure, positionAssignments, isMainOrQualifyingFirst, removeAssignments });
  } else if (positionAssignments && (!isMainOrQualifyingFirst || removeAssignments)) {
    structure.positionAssignments = positionAssignments.map((assignment) => {
      delete assignment.participantId;
      return assignment;
    });
    structure.seedAssignments = [];
  }
}

function resetLuckyDrawAssignments({ structure, positionAssignments, isMainOrQualifyingFirst, removeAssignments }) {
  const initialDrawPositions = new Set(
    (structure.matchUps ?? [])
      .filter((m: any) => m.roundNumber === 1)
      .flatMap((m: any) => m.drawPositions ?? [])
      .filter(Boolean),
  );

  if (isMainOrQualifyingFirst) {
    // Keep R1 position slots; clear participants/byes only if removeAssignments
    structure.positionAssignments = positionAssignments
      .filter((a) => initialDrawPositions.has(a.drawPosition))
      .map((a) => {
        if (removeAssignments) {
          delete a.bye;
          delete a.participantId;
        }
        return a;
      });
    if (removeAssignments) {
      structure.seedAssignments = [];
    }
  } else {
    // Playoff structures: clear all assignments
    structure.positionAssignments = [];
    structure.seedAssignments = [];
  }
}

/**
 * Which drawPositions in each downstream matchUp were delivered by a match that was PLAYED.
 *
 * A drawPosition reaches a round beyond the first in exactly three ways: it won a match, a BYE
 * advanced it, or a feed link reserved the slot for it. Only the first is a result, and reset undoes
 * results — so this returns the first kind alone, keyed by the matchUp it was delivered into, and
 * everything absent from it survives the reset untouched.
 *
 * **BYE-ness is read from `positionAssignment`, never from `matchUpStatus`.** The assignment is a
 * fact about the DRAW and is precisely what a reset keeps; the status is not, and a cascade may
 * already have overwritten it (CA, 2026-09-20 — *"in both cases the BYE remains a BYE"*). A feeder
 * holding a bye on either of its own positions therefore delivered an advancement nobody played for,
 * whatever its status now says.
 *
 * Fed slots need no special case and get none: a reserved position appears in no feeder's
 * `drawPositions`, so it is never collected here and is never removed. That is why this replaces the
 * `participantFed` test it grew out of rather than extending it — that test asked whether a side was
 * the reserved slot of a feed round, which is true of *one* side of *one* round and false of every
 * BYE advancement in every elimination draw, so it removed all of them. See
 * `src/tests/mutations/drawDefinitions/resetPreservesByeAdvancements.test.ts`.
 */
function getPlayedPositionsByTargetMatchUp(structure, inContextMatchUps): Map<string, Set<number>> {
  const playedPositions = new Map<string, Set<number>>();

  const byeDrawPositions = new Set(
    (structure.positionAssignments ?? []).filter(({ bye }) => bye).map(({ drawPosition }) => drawPosition),
  );

  for (const matchUp of inContextMatchUps) {
    const targetMatchUpId = matchUp.winnerMatchUpId;
    if (!targetMatchUpId) continue;

    const drawPositions = (matchUp.drawPositions ?? []).filter(
      (drawPosition): drawPosition is number => typeof drawPosition === 'number',
    );
    // a feeder holding a bye advanced somebody without a match — nothing it delivered is a result
    if (drawPositions.some((drawPosition) => byeDrawPositions.has(drawPosition))) continue;

    const collected = playedPositions.get(targetMatchUpId) ?? new Set<number>();
    for (const drawPosition of drawPositions) collected.add(drawPosition);
    playedPositions.set(targetMatchUpId, collected);
  }

  return playedPositions;
}

function resetStructureMatchUps({
  removeScheduling,
  tournamentRecord,
  removeAssignments,
  drawDefinition,
  getRawMatchUp,
  isLuckyDraw,
  matchUpsMap,
  structure,
  event,
}) {
  const { matchUps: inContextMatchUps, isRoundRobin } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    matchUpsMap,
    structure,
  });

  const playedPositions = getPlayedPositionsByTargetMatchUp(structure, inContextMatchUps);

  for (const inContextMatchUp of inContextMatchUps) {
    const { matchUpId, roundNumber } = inContextMatchUp;
    const matchUp = getRawMatchUp(matchUpId);
    if (!matchUp) continue;

    delete matchUp.extensions;
    delete matchUp.notes;

    resetMatchUpScore({ matchUp, isLuckyDraw, removeAssignments, roundNumber, isRoundRobin, playedPositions });
    resetMatchUpScheduling({ matchUp, removeScheduling });

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'resetDrawDefinition',
      drawDefinition,
      matchUp,
      event,
    });
  }
}

/**
 * Remove the record of an exit that a reset has just undone.
 *
 * `toBePlayed` clears `matchUpStatusCodes` and `sideExitProvenance` on every matchUp it overwrites,
 * and a BYE matchUp is deliberately NOT overwritten — the BYE is POSITIONING, which reset keeps, and
 * CA's ruling is that "the BYE remains a BYE" (2026-09-20). The skip took the clear with it: CA hit
 * it on 2026-09-24 in a COMPASS 16 where a `DOUBLE_WALKOVER` at `East|1|2` left `West|1|1` reading
 * `matchUpStatus: BYE` beside `matchUpStatusCodes` describing a WALKOVER that no longer existed, and
 * `North|1|1` holding a `byeClaims` entry for the same vanished exit.
 *
 * So the two are separated. The status is decided by the branches below; the residue goes from every
 * matchUp regardless, because it describes a RESULT and reset undoes results.
 *
 * `clearSideExitProvenance`, not `clearResolvedSideExitProvenance`: the conditional variant returns
 * early on exactly the statuses at issue here (`isAnyExit`, and `BYE`), because it is written for
 * opportunistic callers that may be looking at a matchUp which is still the exit its provenance
 * describes. After a reset nothing is still that exit.
 *
 * Not gated on the schema write mode, and both representations go: the mode decides whether an
 * attribute is WRITTEN, never whether stale state is removed.
 */
function clearExitResidue(matchUp) {
  // guarded, so a reset does not introduce an empty array onto every matchUp in the draw that never
  // carried codes; blanked rather than deleted where it did, matching the post-reset shape
  // `toBePlayed` leaves on the matchUps it overwrites
  if (matchUp.matchUpStatusCodes?.length) matchUp.matchUpStatusCodes = [];
  clearSideExitProvenance(matchUp);
}

function resetMatchUpScore({ matchUp, isLuckyDraw, removeAssignments, roundNumber, isRoundRobin, playedPositions }) {
  clearExitResidue(matchUp);

  if (isLuckyDraw) {
    if (!removeAssignments && matchUp.matchUpStatus === BYE) {
      // BYE matchUp stays as-is when preserving assignments
    } else {
      Object.assign(matchUp, toBePlayed);
    }
    // A lucky draw does NOT keep its downstream positions, and the difference from the elimination
    // branch below is the whole point rather than an oversight. There is no structural slot here for
    // a BYE to advance into: a lucky draw's later-round pairings are DRAWN, by an explicit
    // `luckyDrawAdvancement` action. They are therefore an action to undo, not a consequence of the
    // positioning reset keeps, and clearing them is what returns the draw to its pre-advancement
    // state. Pinned by `resetDrawDefinition.test.ts` § "removes virtual positions".
    if (roundNumber && roundNumber > 1) matchUp.drawPositions = [];
    return;
  }

  if (matchUp.matchUpStatus !== BYE) Object.assign(matchUp, toBePlayed);

  if (!roundNumber || roundNumber <= 1 || isRoundRobin || !matchUp.drawPositions?.length) return;

  // Remove ONLY the positions a played feeder delivered. Anything else in this matchUp got here
  // without a match being played — a BYE advancement, or a slot reserved by a feed link — and reset
  // undoes RESULTS, so it must survive. See `getPlayedPositionsByTargetMatchUp` for how the two are
  // told apart, and why this is not the `participantFed` test it replaces.
  //
  // Removal, not substitution: preserves ascending order. See `getOrderedDrawPositions`. Settled
  // through `normalizeDrawPositions` for the same reason as the other removal writers: where every
  // position in the matchUp is removed there is no survivor for a hole to hold a side open beside.
  const removable = playedPositions?.get(matchUp.matchUpId);
  matchUp.drawPositions = normalizeDrawPositions(
    matchUp.drawPositions.map((drawPosition) => (removable?.has(drawPosition) ? undefined : drawPosition)),
  );
}

// first-class schedule attributes (NATIVE / BRIDGE) matching the schedule timeItem types below —
// no timeItem mirror, so resetting the draw must clear these directly or the placement persists.
const SCHEDULE_FIRST_CLASS_ATTRS = [
  'allocatedCourts',
  'courtId',
  'venueId',
  'official',
  'courtAnnotation',
  'scheduledDate',
  'scheduledTime',
  'courtOrder',
  'calledAt',
];

function resetMatchUpScheduling({ matchUp, removeScheduling }) {
  if (removeScheduling) {
    delete matchUp.timeItems;
  } else if (matchUp.timeItems?.length) {
    matchUp.timeItems = matchUp.timeItems.filter(
      (timeItem: TimeItem) =>
        timeItem.itemType &&
        ![
          ALLOCATE_COURTS,
          ASSIGN_COURT,
          ASSIGN_VENUE,
          ASSIGN_OFFICIAL,
          COURT_ANNOTATION,
          SCHEDULED_DATE,
          SCHEDULED_TIME,
          COURT_ORDER,
        ].includes(timeItem.itemType),
    );
  }

  if (matchUp.schedule && typeof matchUp.schedule === 'object') {
    for (const attribute of SCHEDULE_FIRST_CLASS_ATTRS) delete matchUp.schedule[attribute];
  }
}

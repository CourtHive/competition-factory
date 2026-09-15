import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getStructureLinks } from '@Query/drawDefinition/linkGetter';
import { pushGlobalLog } from '@Functions/global/globalLog';

// constants
import { FIRST_MATCHUP, WINNER } from '@Constants/drawDefinitionConstants';

/**
 * Swap the winner and loser of an already-decided matchUp, carrying the change downstream.
 *
 * Reached only via `allowChangePropagation`, which `resolveAndApplyOutcome` checks BEFORE the
 * `activeDownstream` dispatch — so none of the refusals that guard an ordinary re-score apply here.
 * TMX's score modal sends that flag on every score, which makes this the production correction path.
 */
export function swapWinnerLoser(params) {
  const { tournamentRecord, inContextMatchUp, structure, drawDefinition, event } = params;
  const matchUpRoundNumber = inContextMatchUp.roundNumber;

  const existingWinnerSide = inContextMatchUp.sides.find((side) => side.sideNumber === inContextMatchUp.winningSide);
  const existingLoserSide = inContextMatchUp.sides.find((side) => side.sideNumber !== inContextMatchUp.winningSide);

  const { drawPosition: existingWinnerDrawPosition, participantId: existingWinnerParticipantId } = existingWinnerSide;
  const { drawPosition: existingLoserDrawPosition, participantId: existingLoserParticipantId } = existingLoserSide;

  const stack = 'swapWinnerLoser';

  const { matchUps } = getAllStructureMatchUps(params);
  const existingWinnerSubsequentMatchUps = matchUps.filter(
    ({ drawPositions, roundNumber }) =>
      drawPositions?.includes(existingWinnerDrawPosition) && roundNumber > matchUpRoundNumber,
  );

  pushGlobalLog({ method: 'swapWinnerLoser', existingWinnerSubsequentMatchUps });

  /**
   * Replace the advancing drawPosition in every subsequent matchUp — AND RE-SORT.
   *
   * A positional `map` SUBSTITUTES in place and therefore cannot preserve ascending order: this line
   * rewrote a round-3 matchUp holding [4, 5] to [7, 5] (census seed 9000012, DOUBLE_ELIMINATION
   * 8/7), reported as DRAW_POSITIONS_NOT_SORTED — 25 findings across two 600-seed windows, all from
   * here. The ascending order is the side/position binding, and readers resolve the WRONG
   * participant without it.
   *
   * The rule, the three reader idioms that depend on it, and the survey of every other writer are
   * stated once in `getOrderedDrawPositions`. Do not remove the sort below.
   */
  existingWinnerSubsequentMatchUps.forEach((matchUp) => {
    matchUp.drawPositions = (
      matchUp.drawPositions?.map((drawPosition) =>
        drawPosition === existingWinnerDrawPosition ? existingLoserDrawPosition : drawPosition,
      ) ?? []
    ).sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : 0));
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: params.event?.eventId,
      context: stack,
      drawDefinition,
      matchUp,
      event,
    });
  });

  const { stage: currentStage, stageSequence: currentStageSequence } = structure;
  const subsequentStructureIds = drawDefinition.structures
    .filter(({ stage, stageSequence }) => stage === currentStage && stageSequence > currentStageSequence)
    .map(({ structureId }) => structureId);

  const {
    targetLinks: { loserTargetLink, winnerTargetLink },
  } = params.targetData;

  /**
   * EVERY structure the source structure feeds — not only the ones THIS matchUp's links name.
   *
   * A structure fed by a DIFFERENT ROUND of the same source sits at the SAME `stageSequence`, so
   * the `stageSequence > currentStageSequence` rule above can never reach it, and this matchUp's
   * own `targetLinks` never name it. It was therefore never iterated and its `positionAssignments`
   * were never corrected.
   *
   * Measured at drawSize 16 — every target below shares one `stageSequence`:
   *
   *   COMPASS  East r1 -> West | East r2 -> North | East r3 -> Northeast   (all PLAY_OFF, seq 2)
   *   OLYMPIC  East r1 -> West | East r2 -> North                          (both PLAY_OFF, seq 2)
   *   CURTIS   Main r1,r2 -> Consolation 1 | Main r3 -> Play Off
   *
   * So flipping `East|1|4` rewrote `East|3|1` correctly and corrected `West`, while `North` and
   * `Northeast` kept the participant who no longer lost that round — and the one who now loses it
   * was absent. Both halves wrong at once, reported as DROPPED_PROGRESSION, and NOT an eligibility
   * question: COMPASS, OLYMPIC and CURTIS_CONSOLATION emit no `linkCondition` at all.
   *
   * The links are the engine's own statement of what this structure feeds, so they are what is
   * read here rather than a stage/sequence heuristic that stands in for them.
   */
  const { links: sourceStructureLinks } = getStructureLinks({
    structureId: structure.structureId,
    drawDefinition,
  });
  const fedLinks = (sourceStructureLinks?.source ?? []).filter(Boolean);

  /**
   * A structure this one feeds its WINNERS to is a CONTINUATION of the main progression, not a
   * back-draw, and the swap below is the wrong instrument for it.
   *
   * Swapping two participants wherever they appear is right for a back-draw, whose occupancy is
   * decided by who lost which round. A winner-fed structure's occupancy is decided by the whole
   * bracket, so a local swap corrupts it — measured on DOUBLE_ELIMINATION 8/7, where
   * `Main r4 --WINNER--> Decider` meant flipping a round-1 matchUp reached the Decider and left an
   * exit matchUp with a winningSide and nobody on the losing side (EXIT_WITHOUT_LOSER, census seed
   * 9100424). Including them took that draw type's Route A/B divergence from 13 to 15 of 28.
   *
   * Re-deriving those correctly is the structural rewrite's job, not this one's. THIS matchUp's own
   * `winnerTargetLink` is still honoured below, exactly as before — only OTHER rounds' winner
   * targets are withheld.
   */
  const winnerFedStructureIds = new Set(
    fedLinks.filter((link) => link?.linkType === WINNER).map((link) => link?.target?.structureId),
  );

  /**
   * ...and only from rounds AT OR AFTER the one being flipped.
   *
   * A structure fed by an EARLIER round was populated by results this flip does not touch, so
   * correcting it can only do harm. Measured on DOUBLE_ELIMINATION 8/7, where `Backdraw` is fed by
   * `Main` rounds 1-3: without this bound, flipping the FINAL (`Main|4|1`) reached back into the
   * Backdraw and made both participant counts diverge from Route B where they had agreed — the
   * widening over-correcting rather than under-correcting.
   *
   * The flipped round's own target does not depend on this filter: `loserTargetLink` names it
   * directly and is listed first, exactly as before.
   */
  const onwardFedStructureIds = fedLinks
    .filter((link) => (link?.source?.roundNumber ?? 0) >= matchUpRoundNumber)
    .map((link) => link?.target?.structureId)
    .filter((structureId) => !winnerFedStructureIds.has(structureId));

  const targetStructureIds = [
    loserTargetLink?.target.structureId,
    winnerTargetLink?.target?.structureId,
    ...onwardFedStructureIds,
  ].filter(Boolean);

  // find target structures that are not part of current stage...
  // ... as well as any subsequent structures
  drawDefinition.structures
    .filter(({ stage, structureId }) => {
      return stage !== currentStage && targetStructureIds.includes(structureId);
    })
    .forEach(({ stage: targetStage, stageSequence: targetStageSequence, structureId }) => {
      if (!subsequentStructureIds.includes(structureId)) subsequentStructureIds.push(structureId);

      drawDefinition.structures
        .filter(({ stage, stageSequence }) => stage === targetStage && stageSequence > targetStageSequence)
        .forEach(({ structureId }) => {
          if (!subsequentStructureIds.includes(structureId)) subsequentStructureIds.push(structureId);
        });
    });

  const subsequentStructures = drawDefinition.structures.filter(({ structureId }) =>
    subsequentStructureIds.includes(structureId),
  );

  /**
   * A FIRST_MATCH consolation is not a mirror of the main draw, so the feed does not simply swap.
   *
   * `directLoser` admits a loser to a `FIRST_MATCHUP` target only with zero prior scored wins
   * (`validForConsolation`), and places a BYE at the backdraw position otherwise. Swapping the
   * assignment blindly ignored that rule: flipping a result whose new loser had ALREADY won a match
   * wrote them into the consolation anyway — measured on seed 9000349, where Sheldon Shelley
   * (1 scored win in Main R1) replaced Leeloo Goldstein (a round-1 BYE, so the flipped matchUp was
   * genuinely her first). `getDrawInconsistencies` cannot see it: it reports eligible-but-ABSENT
   * only, and has no ineligible-but-PRESENT counterpart.
   *
   * Counted over PRIOR rounds only. This runs BEFORE `modifyMatchUpScore` applies the new
   * winningSide, so the matchUp being swapped still records the incoming loser as its winner;
   * including it would count the very win that is being taken away. Prior rounds are also exactly
   * what the rule means by "had already won a match".
   */
  const { loserTargetLink: feedLink } = params.targetData.targetLinks;
  const firstMatchUpTargetStructureId =
    feedLink?.linkCondition === FIRST_MATCHUP ? feedLink?.target?.structureId : undefined;
  // `inContext: true` is required, exactly as `directLoser` sources the same count: without it the
  // sides carry no `drawPosition`, `getDrawPositionWinCount` matches no side and returns 0, and
  // every participant looks like a first-match loser.
  const { matchUps: inContextStructureMatchUps } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    drawDefinition,
    structure,
    event,
  });
  const priorRoundMatchUps = (inContextStructureMatchUps ?? []).filter(
    ({ roundNumber }) => (roundNumber ?? 0) < matchUpRoundNumber,
  );
  const incomingLoserHasPriorWin =
    getDrawPositionWinCount({
      sourceMatchUps: priorRoundMatchUps,
      drawPosition: existingWinnerDrawPosition,
    }) > 0;

  // for each subsequent structure swap drawPosition assignments (where applicable)
  subsequentStructures.forEach((structure) => {
    const { positionAssignments } = getPositionAssignments({ structure });
    // Both lookups are guarded on the id being present. When a side holds no participant — which
    // is the normal state after a double exit — the id is undefined, and an unguarded
    // `participantId === undefined` matches the first UNOCCUPIED assignment instead of matching
    // nothing. Measured: a COMPASS back-draw BYE placed by a double-walkover cascade was selected
    // that way and had a participant written onto it, leaving an assignment that was both
    // `bye: true` and assigned — a combination the two flags are meant to exclude.
    const existingWinnerAssignment = existingWinnerParticipantId
      ? positionAssignments?.find(({ participantId }) => participantId === existingWinnerParticipantId)
      : undefined;
    const existingLoserAssignment = existingLoserParticipantId
      ? positionAssignments?.find(({ participantId }) => participantId === existingLoserParticipantId)
      : undefined;

    if (existingWinnerAssignment) existingWinnerAssignment.participantId = existingLoserParticipantId;

    // The incoming loser is not a first-match loser: the slot they would have taken becomes a BYE,
    // which is what `directLoser` does for the same participant on the same link.
    if (
      existingLoserAssignment &&
      structure.structureId === firstMatchUpTargetStructureId &&
      incomingLoserHasPriorWin
    ) {
      delete existingLoserAssignment.participantId;
      assignDrawPositionBye({
        drawPosition: existingLoserAssignment.drawPosition,
        structureId: structure.structureId,
        byeFromPropagation: true,
        tournamentRecord,
        drawDefinition,
        event,
      });
      return;
    }

    if (existingLoserAssignment) existingLoserAssignment.participantId = existingWinnerParticipantId;
  });

  // apply new winningSide and any score updates
  return modifyMatchUpScore({ ...params, context: stack });
}

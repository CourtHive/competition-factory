import { setOutcomePipeline } from '@Global/state/globalState';
import { defined } from '@Tests/helpers/defined';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { CONSOLATION, FIRST_ROUND_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { BYE, RETIRED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

/**
 * A RESULT RE-ENTERED WHERE ITS WINNER HAS PLAYED ON DIRECTS NOBODY, WHEREVER ITS LOSER STANDS (record soak
 * 2026-11-18, class D1: 2,325 calls, 2,005 of them on draws consistent as loaded).
 *
 * The same winner entered again beneath an active downstream writes the matchUp and directs nothing (`apply-values`,
 * v1's `winningSideWithDownstreamDependencies`). v2 planned the loser's half as standing in the matchUp the loser LINK
 * names. A converted record need not hold them there:
 *
 *  - PLACED BY ANOTHER FEED (USTA feed-in championships, 1,100 matchUps): the consolation rounds were filled in an order
 *    the links' feed profiles do not describe, and the stored `loserMatchUpId` names where the loser was put. The loser
 *    stands in the link's round, in another matchUp. `getDrawInconsistencies` finds nothing wrong with the draw.
 *  - NEVER PLACED (ingested consolation draws): the loser is in no matchUp of the link's structure.
 *
 * The write is the matchUp's own in both pipelines; only the plan's claim differed, and `differential` raised it. Where
 * the loser does not stand in the link's matchUp the call is now read off v1's whole write (`loser`), so a relabel that
 * carries or withdraws an exit there is v1's too, settled where v1 finds the loser.
 */

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

const structureOf = (drawDefinition, stage: string) => drawDefinition.structures.find((s) => s.stage === stage);

function generate(completeAllMatchUps: boolean) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 8, completeAllMatchUps }],
  });
  return { tournamentRecord, drawId };
}

const inRound = (matchUps, roundNumber: number) =>
  matchUps.filter((matchUp) => matchUp.roundNumber === roundNumber).sort((a, b) => a.roundPosition - b.roundPosition);

/** the consolation seats of two first-round losers exchanged, and the stored edges with them: placed by another feed */
function placedByAnotherFeed() {
  const { tournamentRecord, drawId } = generate(true);
  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  // the first and third: the losers of the first and second share a consolation matchUp
  const [first, , second] = inRound(structureOf(drawDefinition, MAIN).matchUps, 1);
  const assignments = structureOf(drawDefinition, CONSOLATION).positionAssignments;
  const [targetOfFirst, targetOfSecond] = [first, second].map((matchUp) => matchUp.loserMatchUpId);
  const seats = [targetOfFirst, targetOfSecond].map((matchUpId) => {
    const target = structureOf(drawDefinition, CONSOLATION).matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
    const loserOf = matchUpId === targetOfFirst ? first : second;
    const mainAssignments = structureOf(drawDefinition, MAIN).positionAssignments;
    const loserPosition = loserOf.drawPositions[2 - loserOf.winningSide];
    const loserId = mainAssignments.find((assignment) => assignment.drawPosition === loserPosition).participantId;
    return assignments.find(
      (assignment) => target.drawPositions.includes(assignment.drawPosition) && assignment.participantId === loserId,
    );
  });
  expect(seats.every(Boolean)).toEqual(true);
  [seats[0].participantId, seats[1].participantId] = [seats[1].participantId, seats[0].participantId];
  [first.loserMatchUpId, second.loserMatchUpId] = [second.loserMatchUpId, first.loserMatchUpId];
  return { tournamentRecord, drawId, matchUpId: first.matchUpId, linkTargetId: targetOfFirst };
}

/** the loser's consolation seat stored as a BYE, their opponent sent on past it: the loser was never placed */
function neverPlaced() {
  const { tournamentRecord, drawId } = generate(true);
  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  const [first] = inRound(structureOf(drawDefinition, MAIN).matchUps, 1);
  const loserPosition = first.drawPositions[2 - first.winningSide];
  const loserId = structureOf(drawDefinition, MAIN).positionAssignments.find(
    (assignment) => assignment.drawPosition === loserPosition,
  ).participantId;
  const consolation = structureOf(drawDefinition, CONSOLATION);
  const seat = consolation.positionAssignments.find((assignment) => assignment.participantId === loserId);
  const target = consolation.matchUps.find((matchUp) => matchUp.matchUpId === first.loserMatchUpId);
  const final = consolation.matchUps.find((matchUp) => matchUp.roundNumber === 2);
  expect(seat && target.drawPositions.includes(seat.drawPosition)).toEqual(true);
  const opponentPosition = target.drawPositions.find((drawPosition) => drawPosition !== seat.drawPosition);
  const advanced = target.drawPositions[target.winningSide - 1];
  delete seat.participantId;
  seat.bye = true;
  Object.assign(target, { matchUpStatus: BYE, winningSide: undefined, score: undefined });
  // the final holds the opponent where it held the consolation matchUp's winner, and is played as it was
  final.drawPositions = final.drawPositions.map((drawPosition) =>
    drawPosition === advanced ? opponentPosition : drawPosition,
  );
  return { tournamentRecord, drawId, matchUpId: first.matchUpId, linkTargetId: first.loserMatchUpId };
}

const SHAPES: [string, () => ReturnType<typeof placedByAnotherFeed>, boolean][] = [
  ['placed by another feed than the links describe', placedByAnotherFeed, true],
  ['never placed', neverPlaced, false],
];
const RELABELS: [string, object][] = [
  ['its own result', {}],
  ['a retirement', { matchUpStatus: RETIRED }],
];

describe.each(MODES)('pipeline %s', (mode) => {
  describe.each(SHAPES)('a loser %s', (_name, shape, consistent) => {
    it.each(RELABELS)('re-entered as %s, the matchUp is written and nobody is directed', (_relabel, change) => {
      setOutcomePipeline(mode);
      const { tournamentRecord, drawId, matchUpId, linkTargetId } = shape();
      tournamentEngine.setState(tournamentRecord);
      if (consistent) expect(tournamentEngine.getDrawInconsistencies({ drawId }).valid).toEqual(true);

      const stored = () => tournamentEngine.getEvent({ drawId }).drawDefinition;
      const before = stored();
      const source = structureOf(before, MAIN).matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
      const inContext = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
      const loserId = inContext
        .find((matchUp) => matchUp.matchUpId === matchUpId)
        .sides.find(({ sideNumber }) => sideNumber === 3 - source.winningSide).participantId;
      // the shape: the loser link's matchUp does not hold the loser
      const linkTarget = inContext.find((matchUp) => matchUp.matchUpId === linkTargetId);
      expect(linkTarget.sides.some(({ participantId }) => participantId === loserId)).toEqual(false);

      const outcome = { matchUpStatus: source.matchUpStatus, winningSide: source.winningSide, ...change };
      let result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
      expect(result.success).toEqual(true);

      const after = stored();
      const written = structureOf(after, MAIN).matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
      expect(written.matchUpStatus).toEqual(outcome.matchUpStatus);
      expect(written.winningSide).toEqual(source.winningSide);
      // nobody is directed: every seat of the consolation holds who it held, and each of its matchUps is as it was
      const seats = (drawDefinition) =>
        structureOf(drawDefinition, CONSOLATION).positionAssignments.map(({ drawPosition, participantId, bye }) => ({
          drawPosition,
          participantId,
          bye,
        }));
      const results = (drawDefinition) =>
        structureOf(drawDefinition, CONSOLATION).matchUps.map((matchUp) => ({
          matchUpStatus: matchUp.matchUpStatus ?? TO_BE_PLAYED,
          drawPositions: matchUp.drawPositions,
          winningSide: matchUp.winningSide,
          matchUpId: matchUp.matchUpId,
        }));
      expect(seats(after)).toEqual(seats(before));
      expect(results(after)).toEqual(results(before));
    });
  });
});

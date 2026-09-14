import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * `getDrawInconsistencies` could only see one direction of a two-directional rule.
 *
 * `droppedProgressionForLink` reported a participant ELIGIBLE to feed a linked structure and absent
 * from it, and nothing reported the mirror: a participant the feed rule EXCLUDES who is present
 * anyway. That blind spot is what let a real corruption pass as clean — `swapWinnerLoser` wrote the
 * new loser of a flipped result into a FIRST_MATCH consolation without asking whether the rule
 * admits them, and the scan rated the result no different from a correct draw.
 *
 * Only a `FIRST_MATCHUP` loser link can produce it: `isFedLoserEligible` returns true
 * unconditionally for every other link, so `!eligible` cannot arise elsewhere.
 */

const coordinates = (item: any) => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

const STEPS = [
  { structureName: 'Main', roundNumber: 1, roundPosition: 11, outcome: { winningSide: 2 } },
  { structureName: 'Main', roundNumber: 2, roundPosition: 6, outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } },
  {
    structureName: 'Consolation',
    roundNumber: 2,
    roundPosition: 6,
    outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
  },
  { structureName: 'Main', roundNumber: 2, roundPosition: 6, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
];

function playScenario(drawId: string) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 27, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawId }],
    nonRandom: 9000349,
    setState: true,
  });
  setSubscriptions({});

  for (const step of STEPS) {
    const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
    const target = matchUps.find((matchUp: any) => coordinates(matchUp) === coordinates(step));
    expect(target, `no matchUp at ${coordinates(step)}`).toBeDefined();
    tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      allowChangePropagation: true,
      drawId,
    });
  }
}

const issueTypes = (drawId: string) =>
  (tournamentEngine.getDrawInconsistencies({ drawId })?.inconsistencies ?? []).map((issue: any) => issue.issueType);

it('does not flag a draw whose consolation holds only eligible first-match losers', () => {
  const drawId = 'ineligible-negative';
  playScenario(drawId);
  expect(issueTypes(drawId)).toEqual([]);
});

it('flags a participant the feed rule excludes who is present in the target structure', () => {
  const drawId = 'ineligible-positive';
  playScenario(drawId);

  // After the flip, the loser of Main|2|6 is the participant who WON Main|1|11 — a scored win, so
  // the first-match rule excludes them and the engine correctly leaves their consolation slot a BYE.
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  const source: any = matchUps.find((matchUp: any) => coordinates(matchUp) === 'Main|2|6');
  const losingSideNumber = source.winningSide === 1 ? 2 : 1;
  const excludedParticipantId = source.sides.find((side: any) => side.sideNumber === losingSideNumber)?.participantId;
  expect(excludedParticipantId).toBeDefined();

  // Write them in anyway — the state `swapWinnerLoser` used to produce, and which the scan could not
  // see. Done on the drawDefinition directly, because the engine no longer permits it; and the scan
  // is called with that same object, because `getEvent` returns a DEEP COPY and mutating it would
  // leave engine state untouched — measured, as a positive control that reported nothing.
  const drawDefinition: any = tournamentEngine.getEvent({ drawId })?.drawDefinition;
  const consolation = drawDefinition.structures.find((structure: any) => structure.structureName === 'Consolation');
  const byeAssignment = consolation.positionAssignments.find(
    (assignment: any) => assignment.bye && assignment.drawPosition === source.sides[losingSideNumber - 1]?.drawPosition,
  );
  const targetAssignment = byeAssignment ?? consolation.positionAssignments.find((assignment: any) => assignment.bye);
  expect(targetAssignment, 'scenario should leave a BYE for the excluded participant').toBeDefined();
  delete targetAssignment.bye;
  targetAssignment.participantId = excludedParticipantId;

  const inconsistencies: any[] = getDrawInconsistencies({ drawDefinition })?.inconsistencies ?? [];
  const ineligible = inconsistencies.filter((issue: any) => issue.issueType === 'INELIGIBLE_PROGRESSION');

  expect(ineligible.length).toBeGreaterThan(0);
  expect(ineligible[0].participantId).toEqual(excludedParticipantId);
  expect(ineligible[0].matchUpId).toEqual(source.matchUpId);
  expect(ineligible[0].severity).toEqual('error');
});

import { ADVANCED_FROM_UNDECIDED } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// constants
import { DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

/**
 * A participant left standing in a later round after the matchUp that delivered them lost its result is reported.
 *
 * Census w2 9100343 (OLYMPIC 16/11), the steps of `aWithdrawnExitReleasesTheSeatItAwarded.test.ts`. Before #5157,
 * re-scoring `East|1|4` to the other winner withdrew the walkover it had carried into `West|2|1` (TO_BE_PLAYED)
 * and left that walkover's winner in `West|3|1`. Every winner-rooted check starts from a decided matchUp, so
 * `getDrawInconsistencies` reported nothing over a corrupt draw. #5157 fixed the release, so the steps no longer
 * reach the leftover; it is reproduced here on the stored record, exactly as v1 left it: `West|2|1` undecided,
 * its winner still in `West|3|1`.
 */
const drawId = 'advance-out-of-undecided';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
const occupant = (m: any, sideNumber: number) =>
  m.sides.find((side: any) => side.sideNumber === sideNumber)?.participantId;
const inconsistencies = () => (tournamentEngine.getDrawInconsistencies({ drawId }) as any).inconsistencies ?? [];

afterEach(() => setOutcomePipeline());

function score(k: string, outcome: any) {
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: find(k).matchUpId,
    propagateExitStatus: true,
    outcome,
    drawId,
  });
  expect(result.error, k).toBeUndefined();
}

function withdrawResultLeavingTheAdvance(matchUpId: string) {
  const tournamentRecord: any = tournamentEngine.getTournament().tournamentRecord;
  const drawDefinition = tournamentRecord.events
    .flatMap((event: any) => event.drawDefinitions ?? [])
    .find((candidate: any) => candidate.drawId === drawId);
  const matchUp = drawDefinition.structures
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((candidate: any) => candidate.matchUpId === matchUpId);
  matchUp.matchUpStatus = TO_BE_PLAYED;
  delete matchUp.winningSide;
  delete matchUp.matchUpStatusCodes;
  delete matchUp.sideExitProvenance;
  tournamentEngine.setState(tournamentRecord);
}

it('reports the winner a withdrawn walkover left one round on', () => {
  setSubscriptions({});
  const config = { participantsCount: 11, propagateExitStatus: true, drawSize: 16, drawType: OLYMPIC, seed: 9100343 };
  expect(prepareDraw(config as any, drawId)).toEqual(true);

  score('East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 });
  score('East|1|2', { winningSide: 1 });
  score('East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 });

  // CONTROL: the carried walkover decided West|2|1, its winner stands in West|3|1, and the draw is consistent
  const semi = find('West|2|1');
  expect(semi.matchUpStatus).toEqual(WALKOVER);
  const advanced = occupant(semi, semi.winningSide);
  const final = find('West|3|1');
  const advancedSide = final.sides.find((side: any) => side.participantId === advanced);
  expect(advancedSide).toBeDefined();
  expect(inconsistencies()).toEqual([]);

  withdrawResultLeavingTheAdvance(semi.matchUpId);

  expect(find('West|2|1').winningSide).toBeUndefined();
  const found = inconsistencies().filter((inconsistency: any) => inconsistency.issueType === ADVANCED_FROM_UNDECIDED);
  expect(found).toEqual([
    expect.objectContaining({
      matchUpId: final.matchUpId,
      participantId: advanced,
      drawPosition: advancedSide.drawPosition,
      feederMatchUpId: semi.matchUpId,
      severity: 'error',
    }),
  ]);
  expect((tournamentEngine.getDrawInconsistencies({ drawId }) as any).valid).toEqual(false);
});

it('is not reported in a round robin, where every round holds the same positions and nothing advances', () => {
  setSubscriptions({});
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 4 }],
    setState: true,
  });
  const [roundRobinDrawId] = drawIds;
  // CONTROL: round 2 holds participants whose round-1 matchUps are undecided
  const matchUps: any[] = tournamentEngine.allDrawMatchUps({ drawId: roundRobinDrawId, inContext: true }).matchUps;
  expect(matchUps.some((m) => m.roundNumber === 2 && m.sides?.some((side: any) => side.participantId))).toEqual(true);
  expect(matchUps.every((m) => !m.winningSide)).toEqual(true);

  const issues = (tournamentEngine.getDrawInconsistencies({ drawId: roundRobinDrawId }) as any).inconsistencies ?? [];
  expect(issues.filter((issue: any) => issue.issueType === ADVANCED_FROM_UNDECIDED)).toEqual([]);
});

it('is not reported where the feeder holds a BYE, whose advancement is structural, not a result', () => {
  setSubscriptions({});
  const config = { participantsCount: 11, propagateExitStatus: true, drawSize: 16, drawType: OLYMPIC, seed: 9100343 };
  expect(prepareDraw(config as any, drawId)).toEqual(true);
  score('East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 });
  score('East|1|2', { winningSide: 1 });
  score('East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 });
  const semi = find('West|2|1');
  withdrawResultLeavingTheAdvance(semi.matchUpId);
  // CONTROL: the leftover is reported as it stands
  expect(inconsistencies().some((issue: any) => issue.issueType === ADVANCED_FROM_UNDECIDED)).toEqual(true);

  // the same undecided feeder, but one of its seats a BYE: the occupant advanced past the BYE, not by a result
  const tournamentRecord: any = tournamentEngine.getTournament().tournamentRecord;
  const drawDefinition = tournamentRecord.events
    .flatMap((event: any) => event.drawDefinitions ?? [])
    .find((candidate: any) => candidate.drawId === drawId);
  const structure = drawDefinition.structures.find((candidate: any) => candidate.structureId === semi.structureId);
  const loserPosition = semi.sides.find((side: any) => side.sideNumber !== semi.winningSide)?.drawPosition;
  const assignment = structure.positionAssignments.find((candidate: any) => candidate.drawPosition === loserPosition);
  delete assignment.participantId;
  assignment.bye = true;
  tournamentEngine.setState(tournamentRecord);

  expect(find('West|2|1').matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(inconsistencies().filter((issue: any) => issue.issueType === ADVANCED_FROM_UNDECIDED)).toEqual([]);
});

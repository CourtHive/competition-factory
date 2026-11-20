import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED, RETIRED } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

/**
 * A RELABEL WHOSE KEPT-OUT LOSER HAS NO BYE IN THE FED SEAT IS v1's WHOLE (record soak 2026-11-18, class D3: 34 calls,
 * five UTR draws, each inconsistent as loaded).
 *
 * In a FIRST_MATCH_LOSER_CONSOLATION a second-round loser who won their first match is kept out of the consolation, and
 * a propagated BYE takes the fed seat. A record converted from a system whose consolation takes second-round losers
 * holds a PARTICIPANT in that seat, and the consolation matchUp there is played. Re-entering the second-round result
 * (its winner has played on) both pipelines write the matchUp alone; v2's direction stated the BYE, and `differential`
 * raised "no BYE at drawPosition N, v2 planned a propagated BYE there for the kept-out loser".
 *
 * Where the fed seat holds no BYE the loser's half is not planned and the call is read off v1's whole write (`loser`),
 * as it is where an arriving loser does not stand in the link's matchUp (`relabelLoserStandsElsewhere.test.ts`).
 */

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

const structureOf = (drawDefinition, stage: string) => drawDefinition.structures.find((s) => s.stage === stage);

const RELABELS: [string, object][] = [
  ['its own result', {}],
  ['a retirement', { matchUpStatus: RETIRED }],
];

describe.each(MODES)('pipeline %s', (mode) => {
  it.each(RELABELS)('re-entered as %s, the matchUp is written and the fed seat keeps who it held', (_name, change) => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, completeAllMatchUps: true }],
    });
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const main = structureOf(drawDefinition, MAIN);
    const consolation = structureOf(drawDefinition, CONSOLATION);
    const secondRound = (roundPosition: number) =>
      main.matchUps.find((matchUp) => matchUp.roundNumber === 2 && matchUp.roundPosition === roundPosition);
    const [source, other] = [secondRound(1), secondRound(2)];
    const loserOf = (matchUp) =>
      main.positionAssignments.find((a) => a.drawPosition === matchUp.drawPositions[2 - matchUp.winningSide])
        .participantId;
    const target = consolation.matchUps.find((matchUp) => matchUp.matchUpId === source.loserMatchUpId);
    const seat = consolation.positionAssignments.find(
      (assignment) => target.drawPositions.includes(assignment.drawPosition) && assignment.bye,
    );
    expect(seat).toBeDefined();
    // the converter's shape: somebody holds the fed seat, and the consolation matchUp there is played
    delete seat.bye;
    seat.participantId = loserOf(other);
    Object.assign(target, { matchUpStatus: COMPLETED, winningSide: 1 });
    tournamentEngine.setState(tournamentRecord);
    setOutcomePipeline(mode);

    const seats = () =>
      structureOf(tournamentEngine.getEvent({ drawId }).drawDefinition, CONSOLATION).positionAssignments.map(
        ({ drawPosition, participantId, bye }) => ({ drawPosition, participantId, bye }),
      );
    const before = seats();
    const outcome = { matchUpStatus: COMPLETED, winningSide: source.winningSide, ...change };
    const result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId: source.matchUpId, outcome });
    expect(result.success).toEqual(true);

    const written = structureOf(tournamentEngine.getEvent({ drawId }).drawDefinition, MAIN).matchUps.find(
      (matchUp) => matchUp.matchUpId === source.matchUpId,
    );
    expect([written.matchUpStatus, written.winningSide]).toEqual([outcome.matchUpStatus, source.winningSide]);
    expect(seats()).toEqual(before);
  });
});

import { getTournamentRecords, setSubscriptions } from '@Global/state/globalState';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT } from '@Constants/errorConditionConstants';
import { FIRST_ROUND_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { OUTCOME_PIPELINE_V2 } from '@Tests/testHarness/outcomeModes';

/**
 * `rollbackOnError` on a `setMatchUpStatus` that v1 refuses only after writing. Swapping two decided first-round
 * positions leaves a participant both in the main structure and in the consolation seat they were sent to as a
 * loser; reversing the other first-round result then sends that participant to the consolation structure a second
 * time, and the call is refused with `ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT` after the result and the
 * winner's advance are written.
 *
 * v2 meets the refusal on a copy before any write and takes no snapshot: the record the engine holds afterwards is
 * the same object.
 */

const TOURNAMENT_ID = 'rollback-outcome-pipeline';

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline();
});

const played = (winningSide: 1 | 2) => ({
  score: {
    sets: [1, 2].map((setNumber) => ({
      side1Score: winningSide === 1 ? 6 : 2,
      side2Score: winningSide === 1 ? 2 : 6,
      winningSide,
      setNumber,
    })),
  },
  winningSide,
});

function setUp() {
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd', drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 16 }],
    tournamentAttributes: { tournamentId: TOURNAMENT_ID },
    setState: true,
  });
  const main = tournamentEngine
    .getEvent({ drawId: 'd' })
    .drawDefinition.structures.find((structure: any) => structure.structureName === 'Main');
  const firstRound = (roundPosition: number) =>
    tournamentEngine
      .allDrawMatchUps({ drawId: 'd', inContext: true })
      .matchUps.find(
        (matchUp: any) =>
          matchUp.structureId === main.structureId &&
          matchUp.roundNumber === 1 &&
          matchUp.roundPosition === roundPosition,
      );
  const params = (roundPosition: number, winningSide: 1 | 2) => ({
    matchUpId: firstRound(roundPosition).matchUpId,
    outcome: played(winningSide),
    drawId: 'd',
  });

  expect(tournamentEngine.setMatchUpStatus(params(4, 1)).success).toEqual(true);
  expect(tournamentEngine.setMatchUpStatus(params(1, 2)).success).toEqual(true);
  const swapped = tournamentEngine.swapDrawPositionAssignments({
    structureId: main.structureId,
    drawPositions: [1, 7],
    drawId: 'd',
  });
  expect(swapped.success).toEqual(true);
  // the refused call: reversing the first-round result at round position 4
  return params(4, 2);
}

const recordNow = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);
const held = () => getTournamentRecords()[TOURNAMENT_ID];

it('under v2, the same refusal takes no snapshot and leaves the record as it was', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_V2);
  const refused = setUp();
  const before = recordNow();
  const record = held();

  const direct: any = tournamentEngine.setMatchUpStatus({ ...refused, rollbackOnError: true });
  const queued: any = tournamentEngine.executionQueue([{ method: 'setMatchUpStatus', params: refused }], true);

  for (const result of [direct, queued]) {
    expect(result.error?.code).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT.code);
    expect(result.rolledBack).toEqual(true);
    expect(result.committed).toBeUndefined();
  }
  expect(held()).toBe(record);
  expect(recordNow()).toEqual(before);
});

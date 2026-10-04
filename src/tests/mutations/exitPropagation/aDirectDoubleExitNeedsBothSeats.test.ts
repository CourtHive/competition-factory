import { getDrawDefinition, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';

/**
 * A DIRECT double exit needs both seats reached — CA, 2026-10-04: *"There should be no way for a matchUp
 * to be a DOUBLE_EXIT when another produced exit arrives … How can three entities arrive in one matchUp
 * which can only hold two drawPositions?"*
 *
 * `checkParticipants` waived the two-participant rule for any direct entry naming no winner whenever
 * `propagateExitStatus` was on, so a double exit could be entered beside a seat nobody had reached. The
 * arrival into that seat then met a double exit already standing. F3 (Mentat OUTCOME_PIPELINE_OPEN_QUESTIONS)
 * was the result: in census 9100555 the convergence written there was refused and the refusal dropped,
 * reported as success over a walked-over player standing as a winner.
 *
 * Run under the differential, so v2's refusal (row 6, § 2.1) must agree with v1's on every call.
 */
const drawId = 'both-seats';
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) =>
  tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps.find((m: any) => key(m) === k);
const occupants = (m: any) => (m?.sides ?? []).filter((side: any) => side?.participantId).length;

afterEach(() => setOutcomePipeline());

function setOutcome(k: string, outcome: any, propagateExitStatus?: boolean) {
  return tournamentEngine.setMatchUpStatus({ matchUpId: find(k).matchUpId, propagateExitStatus, outcome, drawId });
}

it.each([
  { matchUpStatus: DOUBLE_WALKOVER, propagateExitStatus: true },
  { matchUpStatus: DOUBLE_DEFAULT, propagateExitStatus: true },
  { matchUpStatus: DOUBLE_WALKOVER, propagateExitStatus: false },
  { matchUpStatus: DOUBLE_DEFAULT, propagateExitStatus: undefined },
])(
  'a direct $matchUpStatus beside an unreached seat is refused, propagate=$propagateExitStatus',
  ({ matchUpStatus, propagateExitStatus }) => {
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    setSubscriptions({});
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, drawId }],
      setState: true,
    });
    expect(setOutcome('Main|1|1', { winningSide: 1 }).success).toEqual(true);
    // the control: one participant, and a seat Main|1|2 has not yet filled
    expect(occupants(find('Main|2|1'))).toEqual(1);

    const before = hash(getDrawDefinition(drawId));
    const refused: any = setOutcome('Main|2|1', { matchUpStatus }, propagateExitStatus);
    expect(refused.error?.code).toEqual('ERR_INVALID_MATCHUP_STATUS');
    expect(hash(getDrawDefinition(drawId))).toEqual(before);

    // and once both seats are reached, the same call is accepted
    expect(setOutcome('Main|1|2', { winningSide: 1 }).success).toEqual(true);
    expect(setOutcome('Main|2|1', { matchUpStatus }, propagateExitStatus).success).toEqual(true);
    expect(find('Main|2|1').matchUpStatus).toEqual(matchUpStatus);
  },
);

it('census 9100555, the F3 reproduction, is refused at its first double exit', () => {
  // Both of its double exits were direct entries beside an unreached seat: Main|2|2 (whose other seat
  // Main|1|3 fills later) and Backdraw|3|1. Neither is reachable now, so neither is F3's dropped
  // convergence. A loser carried past a BYE into a standing exit still converges where it is legal:
  // v2 compares it as `winner:loser-exit-past-bye-converged`.
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 6, drawId }],
    nonRandom: 9100555,
    setState: true,
  });
  expect(setOutcome('Main|1|2', { winningSide: 2 }, true).success).toEqual(true);

  expect(occupants(find('Main|2|2'))).toEqual(1);
  const before = hash(getDrawDefinition(drawId));
  const refused: any = setOutcome('Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }, true);
  expect(refused.error?.code).toEqual('ERR_INVALID_MATCHUP_STATUS');
  expect(hash(getDrawDefinition(drawId))).toEqual(before);
});

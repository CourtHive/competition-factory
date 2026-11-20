import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { COMPLETED, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { MISSING_DRAW_POSITIONS } from '@Constants/errorConditionConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

/**
 * A WINNER GIVEN AGAIN TO A MATCHUP WITH NO drawPositions IS REFUSED BEFORE THE FIRST WRITE (record soak 2026-11-18,
 * class D5: 122 calls, 118 of them on doubles draws of one USTA record consistent as loaded; CA, 2026-11-19).
 *
 * A draw labelled AD_HOC whose matchUps store a `roundPosition` is not ad hoc to the factory (`isAdHoc` reads the
 * matchUps), and its matchUps hold their sides and no `drawPositions`. A first winner there was already refused
 * MISSING_DRAW_POSITIONS before anything was written. A matchUp that ALREADY HELD a winner was exempt, as one that "has
 * sent something": given a winner again, v1 wrote the matchUp and then returned the error from `directParticipants`,
 * and v2 returned success and wrote more. Both now refuse before the first write. The calls are direct: the record is
 * unchanged only if nothing was written. A double exit entered over the stored winner was refused by v1's removal
 * before any write, and v2 planned no refusal for that route: it now refuses the same (row 24's removal clause).
 */

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

/** an ad hoc round with one result, then every matchUp numbered within its round as the converter stores them */
function numberedAdHocRound() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: AD_HOC, drawSize: 4, automated: true, roundsCount: 1 }],
  });
  tournamentEngine.setState(tournamentRecord);
  const [{ matchUpId }] = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
  const outcome = { matchUpStatus: COMPLETED, winningSide: 1 };
  expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);

  const record = tournamentEngine.getTournament().tournamentRecord;
  record.events[0].drawDefinitions[0].structures[0].matchUps.forEach((matchUp, index) => {
    matchUp.roundPosition = index + 1;
  });
  return { tournamentRecord: record, drawId, matchUpId };
}

const CALLS: [string, object][] = [
  ['the winner it holds', { matchUpStatus: COMPLETED, winningSide: 1 }],
  ['the other side as winner', { matchUpStatus: COMPLETED, winningSide: 2 }],
  // its removal comes first (`completed-to-double-exit`), and is what refuses
  ['a double exit', { matchUpStatus: DOUBLE_WALKOVER }],
];

describe.each(MODES)('pipeline %s', (mode) => {
  it.each(CALLS)('given %s, the call is refused and nothing is written', (_name, outcome) => {
    const { tournamentRecord, drawId, matchUpId } = numberedAdHocRound();
    tournamentEngine.setState(tournamentRecord);
    setOutcomePipeline(mode);

    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    let result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome });
    expect(result.error?.code).toEqual(MISSING_DRAW_POSITIONS.code);
    expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
  });
});

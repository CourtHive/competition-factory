import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { DEFAULTED, DOUBLE_DEFAULT, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MISSING_DRAW_POSITIONS } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

/**
 * A LINE GIVEN A WINNER UNDER A DUAL THAT HOLDS NO DRAWPOSITIONS IS REFUSED BEFORE THE FIRST WRITE (§ 2 row 24; walk
 * 2026-11-20). The dual holds only a pending produced DEFAULTED, from a double default, and its other feeder has been
 * cleared, so there is nobody for the dual to direct:
 *
 *  - a line that DECIDES the dual (TEAM SINGLE_ELIMINATION 4, DOMINANT_DUO): v1 tallied the dual COMPLETED 2-0 and then
 *    returned `ERR_MISSING_DRAW_POSITIONS` from `directParticipants` over that write;
 *  - a CORRECTED line (TEAM SINGLE_ELIMINATION 8, USTA_COLLEGE: a line won before both teams were taken back out, given
 *    a WALKOVER to the other side): v1 refused from `removeDirectedParticipants`, before writing.
 *
 * v2 planned neither refusal, so `differential` raised "v1 ERR_MISSING_DRAW_POSITIONS, v2 ok". Both now ask
 * `lineDirectsUnfedDual` before anything is written, and the record is left as it was.
 */

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

const won = (winningSide: number) => generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide }).outcome;

function teamDraw(drawSize: number, tieFormatName: string) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd', drawSize, eventType: TEAM, tieFormatName }],
    setState: true,
  });
  tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' });
}

const dual = (roundNumber: number, roundPosition: number) =>
  tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true, matchUpFilters: { matchUpTypes: [TEAM] } })
    .matchUps.find((m) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);

const set = (matchUpId: string, outcome: any) => {
  const result = tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome });
  expect(result.error).toBeUndefined();
};

/** the final holds only the produced DEFAULTED of a double default: the other semifinal decided, then cleared */
function finalOfADoubleDefaultAndAClearedSemifinal() {
  teamDraw(4, 'DOMINANT_DUO');
  set(dual(1, 1).matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
  set(dual(1, 2).matchUpId, won(2));
  const singles = dual(2, 1).tieMatchUps.find((line) => line.matchUpType === SINGLES);
  set(singles.matchUpId, { matchUpStatus: DEFAULTED, winningSide: 1 });
  set(dual(1, 2).matchUpId, { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } });
  const final = dual(2, 1);
  expect(final.drawPositions?.filter(Boolean) ?? []).toEqual([]);
  const doubles = final.tieMatchUps.find((line) => line.matchUpType === DOUBLES);
  return { matchUpId: doubles.matchUpId, outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } };
}

/** a line of a semifinal won while both teams stood, both then taken back out (a cleared feeder, a double default) */
function correctedLineOfAnEmptiedSemifinal() {
  teamDraw(8, 'USTA_COLLEGE');
  set(dual(1, 4).matchUpId, won(1));
  set(dual(1, 3).matchUpId, { matchUpStatus: DEFAULTED, winningSide: 2 });
  const singles = dual(2, 2).tieMatchUps.filter((line) => line.matchUpType === SINGLES)[0];
  set(singles.matchUpId, won(1));
  set(dual(2, 2).matchUpId, { matchUpStatus: TO_BE_PLAYED });
  set(dual(1, 4).matchUpId, { matchUpStatus: TO_BE_PLAYED });
  set(dual(1, 3).matchUpId, { matchUpStatus: DOUBLE_DEFAULT });
  expect(dual(2, 2).drawPositions?.filter(Boolean) ?? []).toEqual([]);
  return { matchUpId: singles.matchUpId, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } };
}

const scenarios = {
  'a line deciding a dual that holds only a produced exit': finalOfADoubleDefaultAndAClearedSemifinal,
  'a line corrected under a dual both of whose teams were taken back out': correctedLineOfAnEmptiedSemifinal,
};

describe('a line given a winner under a dual holding no drawPositions is refused before the first write', () => {
  for (const [name, setup] of Object.entries(scenarios))
    for (const mode of MODES)
      it(`${name} (${mode})`, () => {
        const { matchUpId, outcome } = setup();
        const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
        setOutcomePipeline(mode);
        const result = tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome });
        expect(result.error?.code).toEqual(MISSING_DRAW_POSITIONS.code);
        expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
      });
});

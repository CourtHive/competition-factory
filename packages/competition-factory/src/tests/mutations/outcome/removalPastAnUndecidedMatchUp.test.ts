import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Tests/testHarness/outcomeModes';

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

/**
 * A WINNER TAKEN BACK IS TAKEN OUT OF EVERY LATER ROUND THAT HOLDS THEM (record soak 2026-11-18, classes D6 and D7:
 * six calls on ingested draws, each inconsistent as loaded, ADVANCED_FROM_UNDECIDED).
 *
 * A converted record may hold a winner's drawPosition beyond a matchUp that is not decided: in the matchUp after it
 * (D7), or, in a structure whose later rounds are not halvings, in a matchUp off the winner's path that holds a result
 * (D6). Nothing downstream of the source is active, so its result may be removed or replaced. v1's removal
 * (`removeDirectedParticipants`) takes the drawPosition out of every later round of the structure and resets a result
 * it finds there; v2's planned removal took back the next matchUp's position alone. The two WROTE differently.
 *
 * Where the winner's drawPosition stands in a later round than an undecided next matchUp, the removal is not planned
 * and the call is read off v1's whole write (`winner`).
 */

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

const clear = {
  score: { scoreStringSide1: '', scoreStringSide2: '' },
  matchUpStatus: TO_BE_PLAYED,
  winningSide: undefined,
};

const CALLS: [string, object, number | undefined][] = [
  ['cleared', clear, undefined],
  ['given to the other side', { matchUpStatus: COMPLETED, winningSide: 2 }, 2],
];

describe.each(MODES)('pipeline %s', (mode) => {
  it.each(CALLS)(
    'a result %s takes its winner out of the round after the undecided matchUp',
    (_name, outcome, side) => {
      const {
        tournamentRecord,
        drawIds: [drawId],
      } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }] });
      tournamentEngine.setState(tournamentRecord);
      const at = (roundNumber: number, roundPosition: number) =>
        tournamentEngine
          .allDrawMatchUps({ drawId })
          .matchUps.find((matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition);
      const won = { matchUpStatus: COMPLETED, winningSide: 1 };
      // the first matchUp and the whole lower half: the final awaits the upper half's finalist
      for (const [roundNumber, roundPosition] of [
        [1, 1],
        [1, 3],
        [1, 4],
        [2, 2],
      ]) {
        const { matchUpId } = at(roundNumber, roundPosition);
        expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: won }).success).toEqual(true);
      }

      // the converter's shape: the first matchUp's winner stands in the final, past a semifinal nobody has played
      const record = tournamentEngine.getTournament().tournamentRecord;
      const matchUps = record.events[0].drawDefinitions[0].structures[0].matchUps;
      const source = matchUps.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1);
      const final = matchUps.find((matchUp) => matchUp.roundNumber === 3);
      const [winnerPosition, loserPosition] = source.drawPositions;
      const lowerFinalist = final.drawPositions.find(Boolean);
      final.drawPositions = [winnerPosition, lowerFinalist];
      tournamentEngine.setState(record);
      expect(tournamentEngine.getDrawInconsistencies({ drawId }).valid).toEqual(false);
      setOutcomePipeline(mode);

      let result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId: source.matchUpId, outcome });
      expect(result.success).toEqual(true);

      const stored = (roundNumber: number) =>
        tournamentEngine
          .getEvent({ drawId })
          .drawDefinition.structures[0].matchUps.find(
            (matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === 1,
          );
      const positions = (roundNumber: number) => (stored(roundNumber).drawPositions ?? []).filter(Boolean);
      expect(stored(1).winningSide).toEqual(side);
      // the old winner stands nowhere beyond the source; the lower finalist keeps the final
      expect(positions(3)).toEqual([lowerFinalist]);
      expect(positions(2)).toEqual(side ? [loserPosition] : []);
    },
  );
});

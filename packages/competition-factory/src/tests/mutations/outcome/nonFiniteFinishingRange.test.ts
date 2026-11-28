import { setOutcomePipeline } from '@Global/state/globalState';
import { defined } from '@Tests/helpers/defined';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SINGLES } from '@Constants/matchUpTypes';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

/**
 * THE EDGE BACKFILL NEVER STORES A NON-FINITE FINISHING RANGE (record soak 2026-11-18, class T: 39 calls, one draw).
 *
 * A results-only structure: matchUps with sides and results, no `drawPositions`, no `roundPosition`, no position
 * assignments, and a `roundNumber` on one matchUp alone. Any accepted call first stores the draw's edges and finishing
 * rounds (`ensureGoesTo` -> `addGoesTo` -> `addFinishingRounds`). The range derived for the numbered matchUp's winner
 * was the minimum and maximum of an empty slice, `[Infinity, -Infinity]`: v1 and v2 both returned success and left it
 * in the record, where it serialises as `null`; `differential` threw `NonCanonicalValueError` from the comparison's
 * canonical JSON, after v1 had written.
 *
 * A range that cannot be derived is now ABSENT, as it already is on a matchUp with no roundNumber; the finishing round,
 * which is derived, is kept.
 */

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

describe.each(MODES)('pipeline %s', (mode) => {
  it('stores no non-finite finishing range on a results-only structure', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4, completeAllMatchUps: true }],
    });
    const structure = defined(
      defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0].structures,
      'structures',
    )[0];
    const byPosition = new Map(
      defined(structure.positionAssignments, 'positionAssignments').map((a) => [a.drawPosition, a.participantId]),
    );
    // the converter's shape: who played and who won, and a round number on the final alone
    structure.matchUps = defined(structure.matchUps, 'matchUps').map((matchUp) => ({
      sides: defined(matchUp.drawPositions, 'drawPositions').map((drawPosition, index) => ({
        participantId: byPosition.get(drawPosition),
        sideNumber: index + 1,
      })),
      ...(matchUp.roundNumber === 2 ? { roundNumber: 4 } : {}),
      matchUpStatus: matchUp.matchUpStatus,
      winningSide: matchUp.winningSide,
      matchUpId: matchUp.matchUpId,
      matchUpType: SINGLES,
    }));
    delete structure.positionAssignments;
    tournamentEngine.setState(tournamentRecord);
    setOutcomePipeline(mode);

    const [{ matchUpId, winningSide }] = structure.matchUps;
    const outcome = { matchUpStatus: COMPLETED, winningSide };
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);

    const stored = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].matchUps;
    const ranges = stored.flatMap((matchUp) => Object.values(matchUp.finishingPositionRange ?? {}).flat());
    expect(ranges.every((value) => Number.isFinite(value))).toEqual(true);
    // the numbered matchUp keeps the round that was derived for it, and holds no range
    const numbered = stored.find((matchUp) => matchUp.roundNumber);
    expect([numbered.finishingRound, numbered.finishingPositionRange]).toEqual([1, undefined]);
  });
});

import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Tests/testHarness/outcomeModes';

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

/**
 * THE SIDE THE CALLER NAMES IS THE SIDE THAT ADVANCES, HOWEVER THE MATCHUP'S drawPositions ARE STORED (record soak
 * 2026-11-18, class D9: 47 calls on TMX-authored single elimination draws of the nest sample).
 *
 * A record stored before the writers normalised `drawPositions` may hold a matchUp's two positions out of ascending
 * order. Hydration puts the lower position on side 1 as it does for any matchUp, so every view shows it there. v1's
 * direction read the side by the stored array's index, and advanced the OTHER participant: given `winningSide: 1`, the
 * participant shown on side 2 went through. v2 read the hydrated sides and advanced the one named, and `differential`
 * raised the difference. `migrateTournamentRecord` sorts such a record, but nothing migrates a record on load.
 */

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

describe.each(MODES)('pipeline %s', (mode) => {
  it.each([1, 2])('advances the participant shown on side %s of a matchUp stored out of order', (winningSide) => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4 }] });
    const matchUps = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps;
    const source = matchUps.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1);
    source.drawPositions = [...source.drawPositions].reverse();
    tournamentEngine.setState(tournamentRecord);
    setOutcomePipeline(mode);

    const shown = tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find((matchUp) => matchUp.matchUpId === source.matchUpId)
      .sides.find((side) => side.sideNumber === winningSide);
    const outcome = { matchUpStatus: COMPLETED, winningSide };
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId: source.matchUpId, outcome }).success).toEqual(true);

    const final = tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find((matchUp) => matchUp.roundNumber === 2);
    expect(final.drawPositions.filter(Boolean)).toEqual([shown.drawPosition]);
    expect(final.sides.map((side) => side.participantId).filter(Boolean)).toEqual([shown.participantId]);
  });
});

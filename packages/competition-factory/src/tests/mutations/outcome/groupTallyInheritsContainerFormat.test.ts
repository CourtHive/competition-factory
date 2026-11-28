import { setOutcomePipeline } from '@Global/state/globalState';
import { defined } from '@Tests/helpers/defined';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TALLY } from '@Constants/extensionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

/**
 * A GROUP'S TALLY READS EACH MATCHUP UNDER THE FORMAT ITS CONTAINER GIVES IT (record soak 2026-11-18, class D8: 24
 * calls of the nest-audited set, TMX-authored records, consistent as loaded). v1's tally was
 * the one at fault, and is fixed.
 *
 * A round robin whose CONTAINER stores one matchUpFormat (a match tiebreak for the final set) and whose DRAW stores
 * another (none), with a matchUp that stores no format of its own and was decided by a match tiebreak.
 *
 * v1's tally hydrated the GROUP out of its container (`modifyMatchUpScore`), so the matchUp inherited the DRAW's format:
 * the tiebreak set was not read as a 1-0 set, and its winner was credited no game for it. Every other read (whole-draw
 * hydration, the structural index, and so v2's tally) inherits the CONTAINER's format and credits the game. `gamesWon`,
 * `gamesLost`, `gamesPct`, `gamesDiff` and `GEMscore` differed by that game, and v2 wrote the other values.
 */

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

const sets = (scores: [number, number, number?, number?][]) =>
  scores.map(([side1Score, side2Score, side1TiebreakScore, side2TiebreakScore], index) => ({
    setNumber: index + 1,
    side1Score,
    side2Score,
    ...(side1TiebreakScore === undefined ? {} : { side1TiebreakScore, side2TiebreakScore }),
    winningSide: (side1TiebreakScore ?? side1Score) > (side2TiebreakScore ?? side2Score) ? 1 : 2,
  }));

describe.each(MODES)('pipeline %s', (mode) => {
  it('credits the match tiebreak as the container format reads it', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 4, matchUpFormat: 'SET3-S:6/TB7' }],
    });
    const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
    drawDefinition.matchUpFormat = 'SET3-S:6/TB7';
    defined(drawDefinition.structures, 'structures')[0].matchUpFormat = 'SET3-S:6/TB7-F:TB10';
    for (const matchUp of defined(
      defined(defined(drawDefinition.structures, 'structures')[0].structures, 'structures')[0].matchUps,
      'matchUps',
    ))
      delete matchUp.matchUpFormat;
    tournamentEngine.setState(tournamentRecord);
    setOutcomePipeline(mode);

    const [{ matchUpId }] = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
    const score = {
      sets: sets([
        [4, 6],
        [6, 4],
        [0, 0, 10, 4],
      ]),
      scoreStringSide1: '4-6 6-4 [10-4]',
      scoreStringSide2: '6-4 4-6 [4-10]',
    };
    const outcome = { matchUpStatus: COMPLETED, winningSide: 1, score };
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);

    const games = tournamentEngine
      .getEvent({ drawId })
      .drawDefinition.structures[0].structures[0].positionAssignments.map(
        (assignment) =>
          (assignment.tally ?? assignment.extensions?.find(({ name }) => name === TALLY)?.value)?.gamesWon,
      )
      .filter((value) => value !== undefined)
      .sort((a, b) => a - b);
    // the winner's 4 + 6 games and the tiebreak set's one; the loser's 6 + 4
    expect(games).toEqual([10, 11]);
  });
});

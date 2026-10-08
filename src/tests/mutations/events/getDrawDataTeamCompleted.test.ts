import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and types
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLES_MATCHUP, SINGLES_MATCHUP, TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { PayloadProfileEnum } from '@Types/tournamentTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';

// A TEAM draw of 4 with DOMINANT_DUO (two singles and a doubles; two rubbers win the dual). Each dual is
// decided 2-0 on the singles and the doubles, a dead rubber, is never played.
function decideOnSingles({ skipLastDual = false } = {}) {
  const {
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, tieFormatName: 'DOMINANT_DUO', drawSize: 4 }],
    setState: true,
  });
  const result = tournamentEngine.generateLineUps({
    scaleAccessor: { scaleType: RANKING, scaleName: 'U18' },
    useDefaultEventRanking: true,
    attach: true,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  for (const roundNumber of [1, 2]) {
    for (const dual of matchUps().filter((m) => m.matchUpType === TEAM_MATCHUP && m.roundNumber === roundNumber)) {
      const singles = matchUps().filter((m) => m.matchUpTieId === dual.matchUpId && m.matchUpType === SINGLES_MATCHUP);
      // the final is left one rubber short of decided when skipLastDual is set
      const toPlay = skipLastDual && roundNumber === 2 ? singles.slice(0, 1) : singles;
      for (const rubber of toPlay) {
        const scoreString = rubber.matchUpFormat.startsWith('SET3') ? '6-1 6-1' : '8-1';
        const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide: 1 });
        const result = tournamentEngine.setMatchUpStatus({ matchUpId: rubber.matchUpId, outcome, drawId });
        expect(result.success).toEqual(true);
      }
    }
  }

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;
  const full: any = tournamentEngine.getDrawData({ drawDefinition });
  const stubs: any = tournamentEngine.getDrawData({ drawDefinition, structuresProfile: PayloadProfileEnum.STUBS });

  return {
    isCompletedStructure: tournamentEngine.isCompletedStructure({ drawId, structureId }),
    fullStructureCompleted: full.structures[0].structureCompleted,
    stubStructureCompleted: stubs.structures[0].structureCompleted,
    fullDrawCompleted: full.drawInfo.drawCompleted,
    matchUps: matchUps(),
  };
}

it('a TEAM draw whose duals are all decided is completed, dead rubbers notwithstanding', () => {
  const { matchUps, ...completed } = decideOnSingles();

  expect(matchUps.filter((m) => m.matchUpType === TEAM_MATCHUP).every((m) => m.matchUpStatus === COMPLETED)).toEqual(
    true,
  );
  expect(matchUps.filter((m) => m.matchUpType === DOUBLES_MATCHUP).map((m) => m.matchUpStatus)).toEqual([
    TO_BE_PLAYED,
    TO_BE_PLAYED,
    TO_BE_PLAYED,
  ]);

  // the FULL profile read the rubbers too, and reported both false
  expect(completed).toEqual({
    isCompletedStructure: true,
    fullStructureCompleted: true,
    stubStructureCompleted: true,
    fullDrawCompleted: true,
  });
});

it('a TEAM draw whose final dual is undecided is not completed', () => {
  const { matchUps, ...completed } = decideOnSingles({ skipLastDual: true });

  const final = matchUps.find((m) => m.matchUpType === TEAM_MATCHUP && m.roundNumber === 2);
  expect(final.matchUpStatus).toEqual(IN_PROGRESS);
  expect(completed).toEqual({
    isCompletedStructure: false,
    fullStructureCompleted: false,
    stubStructureCompleted: false,
    fullDrawCompleted: false,
  });
});

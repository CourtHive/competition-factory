import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLES_EVENT, SINGLES_EVENT } from '@Constants/eventConstants';
import { REMOVE_SEED } from '@Constants/positionActionConstants';
import { MALE } from '@Constants/genderConstants';

it('can re-position seeds when a seed is withdrawn', () => {
  const targetDrawId = 'someCompletedMatchUps';
  const drawProfiles = [
    {
      category: { ratingType: 'WTN', ratingMin: 8, ratingMax: 12 },
      eventType: DOUBLES_EVENT,
      seedsCount: 8,
      drawSize: 32,
      gender: MALE,
    },
    {
      category: { ratingType: 'WTN', ratingMin: 8, ratingMax: 12 },
      drawId: targetDrawId,
      eventType: SINGLES_EVENT,
      seedsCount: 9,
      drawSize: 32,
      gender: MALE,
    },
    {
      category: { categoryName: '18U' },
      eventType: SINGLES_EVENT,
      seedsCount: 10,
      drawSize: 32,
      gender: MALE,
    },
  ];
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  for (const drawId of drawIds) {
    if (drawId === targetDrawId) {
      // complete a matchUp
      const matchUps = tournamentEngine.allDrawMatchUps({ drawId }).matchUps;
      const matchUp = matchUps.find(({ drawPositions }) => drawPositions.includes(32));
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: { winningSide: 2 },
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const structure = drawDefinition.structures[0];
    const seedAssignments = structure.seedAssignments;

    // there are always 8 seed assignments, even thought higher seedsCounts were give for 2/3 drawProfiles
    expect(seedAssignments.length).toEqual(8);

    const drawPosition = 1;
    let result = tournamentEngine.positionActions({
      structureId: structure.structureId,
      drawPosition,
      drawId,
    });
    expect(result.isActiveDrawPosition).toEqual(false);
    expect(result.isDrawPosition).toEqual(true);
    expect(result.isByePosition).toEqual(false);

    const validActions = result.validActions.map(({ type }) => type);
    if (drawId === targetDrawId) {
      expect(validActions.includes(REMOVE_SEED)).toEqual(false);
    } else {
      expect(validActions.includes(REMOVE_SEED)).toEqual(true);

      const removeAction = result.validActions.find(({ type }) => type === REMOVE_SEED);

      const params = {
        ...removeAction.payload,
      };

      result = tournamentEngine[removeAction.method](params);
      expect(result.success).toEqual(true);
    }
  }
});

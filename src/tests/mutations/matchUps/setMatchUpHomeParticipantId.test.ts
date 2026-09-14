import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { TEAM } from '@Constants/eventConstants';
import {
  INVALID_PARTICIPANT_ID,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP_ID,
  MISSING_PARTICIPANT_ID,
} from '@Constants/errorConditionConstants';

it('can setMatchUpHomeParticipantId', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'drawId', drawSize: 4, idPrefix: 'm', eventType: TEAM }],
    participantsProfile: { idPrefix: 'p' },
    setState: true,
  });

  const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } }).matchUps;
  expect(matchUps.length).toEqual(3);

  const participantIds = matchUps[0].sides.map((side) => side.participantId);
  expect(participantIds.length).toEqual(2);

  let result = tournamentEngine.setMatchUpHomeParticipantId();
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  result = tournamentEngine.setMatchUpHomeParticipantId({
    drawId: 'drawId',
  });
  expect(result.error).toEqual(MISSING_MATCHUP_ID);
  result = tournamentEngine.setMatchUpHomeParticipantId({
    matchUpId: 'm-1-1',
    drawId: 'drawId',
  });
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
  result = tournamentEngine.setMatchUpHomeParticipantId({
    homeParticipantId: 'bogusId',
    matchUpId: 'm-1-1',
    drawId: 'drawId',
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_ID);
  result = tournamentEngine.setMatchUpHomeParticipantId({
    homeParticipantId: participantIds[0],
    matchUpId: 'm-1-1',
    drawId: 'drawId',
  });
  expect(result.success).toEqual(true);

  let matchUp = tournamentEngine.findMatchUp({ matchUpId: 'm-1-1' }).matchUp;
  expect(matchUp.schedule.homeParticipantId).toEqual(participantIds[0]);

  const { homeParticipantId } = tournamentEngine.getHomeParticipantId({ matchUp });
  expect(homeParticipantId).toEqual(participantIds[0]);

  result = tournamentEngine.setMatchUpHomeParticipantId({
    homeParticipantId: '',
    matchUpId: 'm-1-1',
    drawId: 'drawId',
  });
  expect(result.success).toEqual(true);
  matchUp = tournamentEngine.findMatchUp({ matchUpId: 'm-1-1' }).matchUp;
  expect(matchUp.schedule.homeParticipantId).toBeUndefined();
});

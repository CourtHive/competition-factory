import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';

it('can toggle participant check-in state', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  const { tournamentId } = tournamentRecord;

  let {
    upcomingMatchUps: [matchUp],
  } = tournamentEngine.devContext(true).setState(tournamentRecord).drawMatchUps({
    inContext: true,
    drawId,
  });

  const participantIds = matchUp.sides.map(({ participantId }) => participantId);

  let { allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp });
  expect(allParticipantsCheckedIn).toEqual(false);
  expect(checkedInParticipantIds?.length).toEqual(0);

  let result = tournamentEngine.toggleParticipantCheckInState({
    participantId: participantIds[0],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.checkedIn).toEqual(true);
  expect(result.success).toEqual(true);

  ({
    upcomingMatchUps: [matchUp],
  } = tournamentEngine.drawMatchUps({
    inContext: true,
    drawId,
  }));

  ({ allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp }));
  expect(allParticipantsCheckedIn).toEqual(false);
  expect(checkedInParticipantIds?.length).toEqual(1);

  result = tournamentEngine.toggleParticipantCheckInState({
    participantId: participantIds[1],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.checkedIn).toEqual(true);
  expect(result.success).toEqual(true);

  ({
    upcomingMatchUps: [matchUp],
  } = tournamentEngine.drawMatchUps({
    inContext: true,
    drawId,
  }));

  ({ allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp }));
  expect(allParticipantsCheckedIn).toEqual(true);
  expect(checkedInParticipantIds?.length).toEqual(2);

  result = tournamentEngine.toggleParticipantCheckInState({
    participantId: participantIds[1],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.checkedOut).toEqual(true);
  expect(result.success).toEqual(true);

  result = tournamentEngine.toggleParticipantCheckInState({
    participantId: participantIds[1],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.checkedIn).toEqual(true);
  expect(result.success).toEqual(true);

  result = tournamentEngine.toggleParticipantCheckInState({
    participantId: participantIds[1],
    matchUpId: matchUp.matchUpId,
    tournamentId,
    drawId,
  });
  expect(result.checkedOut).toEqual(true);
  expect(result.success).toEqual(true);

  // do it a second time for testing code coverage
  result = tournamentEngine.toggleParticipantCheckInState({
    participantId: participantIds[1],
    matchUpId: matchUp.matchUpId,
    tournamentId,
    drawId,
  });
  expect(result.checkedIn).toEqual(true);
  expect(result.success).toEqual(true);

  // do it a second time for testing code coverage
  result = tournamentEngine.toggleParticipantCheckInState({
    participantId: participantIds[1],
    matchUpId: matchUp.matchUpId,
    tournamentId,
    drawId,
  });
  expect(result.checkedOut).toEqual(true);
  expect(result.success).toEqual(true);

  // do it a second time for testing code coverage
  result = tournamentEngine.toggleParticipantCheckInState({
    participantId: participantIds[1],
    matchUpId: 'bogusId',
    tournamentId,
    drawId,
  });
  expect(result.error).toEqual(MATCHUP_NOT_FOUND);
});

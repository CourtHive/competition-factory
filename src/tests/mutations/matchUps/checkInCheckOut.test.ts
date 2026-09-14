import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import { getMatchUpParticipantIds } from '@Query/matchUp/getMatchUpParticipantIds';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

it('can check-in and check-out matchUp participants', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, eventType: DOUBLES, matchUpFormat: FORMAT_STANDARD }],
  });
  tournamentEngine.setState(tournamentRecord, false);

  const matchUps = tournamentEngine.allDrawMatchUps({
    inContext: true,
    drawId,
  }).matchUps;
  const matchUp = matchUps[0];
  const { matchUpId } = matchUp;

  const { sideParticipantIds, individualParticipantIds } = getMatchUpParticipantIds({ matchUp });
  expect(sideParticipantIds?.length).toEqual(2);
  expect(individualParticipantIds?.length).toEqual(4);

  let result = tournamentEngine.checkInParticipant({
    participantId: individualParticipantIds?.[0],
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  let { matchUp: updatedMatchUp } = tournamentEngine.findMatchUp({
    inContext: true,
    matchUpId,
  });
  expect(updatedMatchUp.timeItems.length).toEqual(1);
  expect(updatedMatchUp.timeItems[0].itemValue).toEqual(individualParticipantIds?.[0]);

  let { allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp: updatedMatchUp });
  expect(allParticipantsCheckedIn).toEqual(false);
  expect(checkedInParticipantIds?.length).toEqual(1);

  result = tournamentEngine.checkInParticipant({
    participantId: individualParticipantIds?.[1],
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  // after checking in the first two individual participants the first side participant
  // should also be in checkedInParticipantIds
  ({ matchUp: updatedMatchUp } = tournamentEngine.findMatchUp({
    inContext: true,
    matchUpId,
  }));

  ({ allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp: updatedMatchUp }));
  expect(allParticipantsCheckedIn).toEqual(false);
  expect(checkedInParticipantIds?.length).toEqual(3);

  // check in the second side (but not the individual participants)
  result = tournamentEngine.checkInParticipant({
    participantId: sideParticipantIds?.[1],
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  // since the second side is checked in, individual participants for second side should be considered checked in
  ({ matchUp: updatedMatchUp } = tournamentEngine.findMatchUp({
    inContext: true,
    matchUpId,
  }));
  ({ allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp: updatedMatchUp }));
  expect(allParticipantsCheckedIn).toEqual(true);
  expect(checkedInParticipantIds?.length).toEqual(6);

  ({ matchUp: updatedMatchUp } = tournamentEngine.findMatchUp({
    inContext: true,
    matchUpId,
  }));
  expect(updatedMatchUp.timeItems.length).toEqual(3);

  // attempt to check in a participant which is already checked in...
  result = tournamentEngine.checkInParticipant({
    participantId: sideParticipantIds?.[0],
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.checkOutParticipant({
    participantId: sideParticipantIds?.[0],
    matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  ({ matchUp: updatedMatchUp } = tournamentEngine.findMatchUp({
    inContext: true,
    matchUpId,
    drawId,
  }));
  ({ allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp: updatedMatchUp }));
  expect(allParticipantsCheckedIn).toEqual(false);
  expect(checkedInParticipantIds?.length).toEqual(3);

  expect(updatedMatchUp.timeItems.length).toEqual(6);
});

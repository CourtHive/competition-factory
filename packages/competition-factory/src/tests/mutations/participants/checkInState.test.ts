import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import { getMatchUpParticipantIds } from '@Query/matchUp/getMatchUpParticipantIds';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ELIMINATION } from '@Constants/drawDefinitionConstants';
import { PAIR } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/eventConstants';
import { MALE } from '@Constants/genderConstants';
import {
  INVALID_ATTESTATION_SUBJECT,
  INVALID_PARTICIPANT_ID,
  MISSING_MATCHUP_ID,
  MISSING_PARTICIPANT_ID,
  PARTICIPANT_NOT_CHECKED_IN,
} from '@Constants/errorConditionConstants';

it('can check participants in and out', () => {
  const participantsProfile = {
    participantsCount: 16,
    participantType: PAIR,
    sex: MALE,
  };
  const drawProfiles = [
    {
      drawSize: 16,
      eventType: DOUBLES,
      participantsCount: 14,
      drawType: ELIMINATION,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    drawProfiles,
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  let {
    upcomingMatchUps: [matchUp],
  } = tournamentEngine.drawMatchUps({
    inContext: true,
    drawId,
  });
  const { sideParticipantIds, individualParticipantIds } = getMatchUpParticipantIds({ matchUp });

  result = tournamentEngine.checkInParticipant({
    participantId: individualParticipantIds?.[0],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  result = tournamentEngine.checkInParticipant({
    participantId: individualParticipantIds?.[0],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  result = tournamentEngine.checkInParticipant({
    participantId: 'bogusId',
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_ID);

  ({
    upcomingMatchUps: [matchUp],
  } = tournamentEngine.drawMatchUps({
    inContext: true,
    drawId,
  }));
  let { allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp });
  expect(allParticipantsCheckedIn).toEqual(false);
  expect(checkedInParticipantIds?.length).toEqual(1);

  result = tournamentEngine.checkInParticipant({
    participantId: individualParticipantIds?.[0],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.error).toBeUndefined();
  expect(result).toMatchObject(SUCCESS);

  ({
    upcomingMatchUps: [matchUp],
  } = tournamentEngine.drawMatchUps({
    inContext: true,
    drawId,
  }));
  ({ allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp }));
  expect(allParticipantsCheckedIn).toEqual(false);
  expect(checkedInParticipantIds?.length).toEqual(1);

  result = tournamentEngine.checkInParticipant({
    participantId: individualParticipantIds?.[1],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  ({
    upcomingMatchUps: [matchUp],
  } = tournamentEngine.drawMatchUps({
    inContext: true,
    drawId,
  }));
  ({ allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp }));
  expect(allParticipantsCheckedIn).toEqual(false);
  // checkedInParticipantIds.length is 3 becuase of 2 individualParticipantIds and their pair participantId
  expect(checkedInParticipantIds?.length).toEqual(3);

  result = tournamentEngine.checkInParticipant({
    participantId: individualParticipantIds?.[2],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  ({
    upcomingMatchUps: [matchUp],
  } = tournamentEngine.drawMatchUps({
    inContext: true,
    drawId,
  }));
  ({ allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp }));
  expect(allParticipantsCheckedIn).toEqual(false);
  expect(checkedInParticipantIds?.length).toEqual(4);

  result = tournamentEngine.checkInParticipant({
    participantId: individualParticipantIds?.[3],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  ({
    upcomingMatchUps: [matchUp],
  } = tournamentEngine.drawMatchUps({
    inContext: true,
    drawId,
  }));
  ({ allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp }));
  expect(allParticipantsCheckedIn).toEqual(true);
  expect(checkedInParticipantIds?.length).toEqual(6);

  // a PAIR is no longer a valid SUBJECT (CODES 7.0.0). It remains a valid derived READ, asserted below.
  result = tournamentEngine.checkOutParticipant({
    participantId: sideParticipantIds?.[0],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_ATTESTATION_SUBJECT);

  // check out ONE member of the first side instead
  result = tournamentEngine.checkOutParticipant({
    participantId: individualParticipantIds?.[0],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  ({
    upcomingMatchUps: [matchUp],
  } = tournamentEngine.drawMatchUps({
    inContext: true,
    drawId,
  }));
  ({ allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp }));
  expect(allParticipantsCheckedIn).toEqual(false);
  // three individuals still in, plus the second side DERIVED from its two members
  expect(checkedInParticipantIds?.length).toEqual(4);
  expect(checkedInParticipantIds).not.toContain(sideParticipantIds?.[0]);
  expect(checkedInParticipantIds).toContain(sideParticipantIds?.[1]);

  // now checkout one individual participant
  result = tournamentEngine.checkOutParticipant({
    participantId: checkedInParticipantIds?.[0],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result).toMatchObject(SUCCESS);

  result = tournamentEngine.checkOutParticipant({
    participantId: checkedInParticipantIds?.[0],
    drawId,
  });
  expect(result.error).toEqual(MISSING_MATCHUP_ID);
  result = tournamentEngine.checkOutParticipant({
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
  result = tournamentEngine.checkOutParticipant({
    participantId: checkedInParticipantIds?.[0],
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_CHECKED_IN);

  ({
    upcomingMatchUps: [matchUp],
  } = tournamentEngine.drawMatchUps({
    drawId,
    inContext: true,
  }));
  ({ allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({ matchUp }));
  expect(allParticipantsCheckedIn).toEqual(false);
  // Both members of the first side are now out, so that side is no longer derived as checked in.
  // The second side and its two members remain — three ids, and the PAIR among them is DERIVED.
  expect(checkedInParticipantIds?.length).toEqual(3);
  expect(checkedInParticipantIds).toContain(sideParticipantIds?.[1]);
  expect(checkedInParticipantIds).not.toContain(sideParticipantIds?.[0]);
});

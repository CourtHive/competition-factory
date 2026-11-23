import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { ADD_PARTICIPANTS, MODIFY_PARTICIPANTS } from '@Constants/topicConstants';

test('participants can be merged', () => {
  let participantAddEventsCounter = 0;
  let participantModifyEventsCounter = 0;
  setSubscriptions({
    subscriptions: {
      [ADD_PARTICIPANTS]: (addedParticipants) => {
        participantAddEventsCounter += addedParticipants?.length || 0;
      },
      [MODIFY_PARTICIPANTS]: (participants) => {
        participantModifyEventsCounter += participants?.length || 0;
      },
    },
  });

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 10 },
  });

  tournamentEngine.setState(tournamentRecord);

  const modifiedParticipant = tournamentRecord.participants[0];
  modifiedParticipant.person.previousNames = ['Previous Name'];
  const { participantId } = modifiedParticipant;

  let { participants: tournamentParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: [participantId] },
  });

  expect(modifiedParticipant.person).not.toEqual(tournamentParticipants[0].person);

  let result = tournamentEngine.mergeParticipants({
    participants: [modifiedParticipant],
  });
  expect(result.success).toEqual(true);

  ({ participants: tournamentParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: [participantId] },
  }));
  expect(modifiedParticipant.person).toEqual(tournamentParticipants[0].person);

  modifiedParticipant.person.previousNames = ['Previous Name', 'Another Name'];

  result = tournamentEngine.mergeParticipants({
    participants: [modifiedParticipant],
  });
  expect(result.success).toEqual(true);

  ({ participants: tournamentParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: [participantId] },
  }));
  expect(modifiedParticipant.person).toEqual(tournamentParticipants[0].person);

  modifiedParticipant.person.previousNames = ['New Previous Name'];

  result = tournamentEngine.mergeParticipants({
    participants: [modifiedParticipant],
    arraysToMerge: ['previousNames'],
  });
  expect(result.success).toEqual(true);

  ({ participants: tournamentParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: [participantId] },
  }));
  expect(tournamentParticipants[0].person.previousNames.length).toEqual(3);

  const { participants } = mocksEngine.generateParticipants({
    participantsCount: 10,
  });

  result = tournamentEngine.mergeParticipants({
    participants,
    arraysToMerge: ['previousNames'],
  });
  expect(result.success).toEqual(true);

  ({ participants: tournamentParticipants } = tournamentEngine.getParticipants());
  expect(tournamentParticipants.length).toEqual(20);

  result = tournamentEngine.newTournamentRecord();
  expect(result.success).toEqual(true);

  result = tournamentEngine.mergeParticipants({ participants });
  expect(result.success).toEqual(true);

  ({ participants: tournamentParticipants } = tournamentEngine.getParticipants());
  expect(tournamentParticipants.length).toEqual(10);

  expect(participantAddEventsCounter).toEqual(3);
  expect(participantModifyEventsCounter).toEqual(3);
});

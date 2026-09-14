import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import * as tools from '@Assemblies/tools';
import { expect, it } from 'vitest';

// constants and types
import { ADD_MATCHUPS, ADD_PARTICIPANTS } from '@Constants/topicConstants';
import { MatchUp, Participant } from '@Types/tournamentTypes';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';

it('can set subscriptions in global state outside of engines', () => {
  const allParticipants: Participant[] = [];
  const allMatchUps: MatchUp[] = [];

  const subscriptions = {
    addMatchUps: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUps }) => {
          allMatchUps.push(...matchUps);
        });
      }
    },
    addParticipants: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ participants }) => {
          allParticipants.push(...participants);
        });
      }
    },
  };

  setSubscriptions({ subscriptions });

  tournamentEngine.devContext(true).newTournamentRecord();
  const participant = {
    participantRole: 'COMPETITOR',
    participantType: 'INDIVIDUAL',
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  tournamentEngine.addParticipant({ participant });
  expect(allParticipants.length).toEqual(1);

  const eventId = tools.UUID();
  tournamentEngine.addEvent({ event: { eventId } });
  const matchUpFormat = 'SET5-S:4/TB7';

  const values = {
    automated: true,
    matchUpFormat,
    drawSize: 32,
    eventId,
  };
  const { drawDefinition } = tournamentEngine.generateDrawDefinition(values);
  tournamentEngine.addDrawDefinition({
    drawDefinition,
    eventId,
  });

  expect(allMatchUps.length).toEqual(31);
});

// in this case running the same test as above, but { delayNotify: true }
it('can delay notifications to subscribers', () => {
  const allParticipants: Participant[] = [];
  const allMatchUps: MatchUp[] = [];

  const subscriptions = {
    [ADD_MATCHUPS]: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUps }) => {
          allMatchUps.push(...matchUps);
        });
      }
    },
    [ADD_PARTICIPANTS]: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ participants }) => {
          allParticipants.push(...participants);
        });
      }
    },
  };

  let result = setSubscriptions({ subscriptions });
  expect(result.success).toEqual(true);

  tournamentEngine.newTournamentRecord();
  const participant = {
    participantRole: COMPETITOR,
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Family',
      standardGivenName: 'Given',
    },
  };

  tournamentEngine.addParticipant({ participant, delayNotify: true });
  // notifications were not sent, so expect no participants
  expect(allParticipants.length).toEqual(0);

  const eventId = tools.UUID();
  tournamentEngine.addEvent({ event: { eventId } });
  const matchUpFormat = 'SET5-S:4/TB7';

  const values = {
    matchUpFormat,
    automated: true,
    drawSize: 32,
    eventId,
  };
  const { drawDefinition } = tournamentEngine.generateDrawDefinition(values);
  result = tournamentEngine.addDrawDefinition({
    drawDefinition,
    eventId,
  });
  expect(result.success).toEqual(true);

  // all notifications sent
  expect(allMatchUps.length).toEqual(31);
  expect(allParticipants.length).toEqual(1);
});

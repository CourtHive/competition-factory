import { unPublishParticipants } from '@Mutate/timeItems/unPublishParticipants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';

it('can publish and unpublish participants', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 10 },
    setState: true,
  });

  let result = tournamentEngine.publishParticipants();
  expect(result.success).toEqual(true);

  let publishState = tournamentEngine.getPublishState().publishState;
  expect(publishState.tournament?.participants?.published).toEqual(true);
  expect(publishState.tournament?.status?.published).toEqual(true);

  result = tournamentEngine.unPublishParticipants();
  expect(result.success).toEqual(true);

  publishState = tournamentEngine.getPublishState().publishState;
  expect(publishState.tournament?.status?.published).toEqual(false);
  expect(publishState.tournament?.participants).toBeUndefined();
});

it('can publish participants with columns and language', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 10 },
    setState: true,
  });

  const columns = {
    country: true,
    events: false,
    ratings: ['WTN', 'UTR'],
    rankings: ['SINGLES'],
  };
  const language = 'fr';

  const result = tournamentEngine.publishParticipants({ columns, language });
  expect(result.success).toEqual(true);

  const publishState = tournamentEngine.getPublishState().publishState;
  expect(publishState.tournament?.participants?.published).toEqual(true);
  expect(publishState.tournament?.participants?.columns).toEqual(columns);
  expect(publishState.tournament?.language).toEqual(language);
});

it('returns error when no tournament records are provided', () => {
  const result = unPublishParticipants({});
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
});

it('handles unPublishParticipants with non-existent status key', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 10 },
    setState: true,
  });

  // publish participants first so there is a timeItem
  let result = tournamentEngine.publishParticipants();
  expect(result.success).toEqual(true);

  // unpublish with a custom status that does not exist in itemValue
  // this exercises the `if (itemValue[status])` false branch
  result = tournamentEngine.unPublishParticipants({ status: 'NONEXISTENT' });
  expect(result.success).toEqual(true);

  // the PUBLIC participants should still be published since we unpublished a non-existent status
  const publishState = tournamentEngine.getPublishState().publishState;
  expect(publishState.tournament?.participants?.published).toEqual(true);
});

it('handles unPublishParticipants when no prior publish exists', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 10 },
    setState: true,
  });

  // unpublish without publishing first — exercises the fallback `{ [status]: {} }` branch
  const result = tournamentEngine.unPublishParticipants();
  expect(result.success).toEqual(true);

  const publishState = tournamentEngine.getPublishState().publishState;
  expect(publishState.tournament?.participants).toBeUndefined();
});

import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import tournamentRecord from '../teamEvents/removeIndividualParticipants.tods.json';
import { CANNOT_REMOVE_PARTICIPANTS } from '@Constants/errorConditionConstants';

it('will remove participants from lineUps unless they are part of a matchUp with a result', () => {
  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  let individualParticipantIds = ['4ca6bc61-8e07-40bb-a54a-7fc96d904b44'];
  let params: any = {
    groupingParticipantId: '175e99a6-c297-4127-8237-9460041903c5',
    addIndividualParticipantsToEvents: true,
    individualParticipantIds,
  };
  let methods = [{ method: 'removeIndividualParticipantIds', params }];
  result = tournamentEngine.executionQueue(methods);
  expect(result.results[0].removed).toEqual(individualParticipantIds);

  individualParticipantIds = ['73426b8b-182a-46bf-8cc6-0d520bda3beb'];
  params = {
    groupingParticipantId: '175e99a6-c297-4127-8237-9460041903c5',
    addIndividualParticipantsToEvents: true,
    individualParticipantIds,
  };
  methods = [{ method: 'removeIndividualParticipantIds', params }];

  result = tournamentEngine.executionQueue(methods);
  expect(result.error).toEqual(CANNOT_REMOVE_PARTICIPANTS);
  expect(result.cannotRemove).toEqual(individualParticipantIds);

  params.suppressErrors = true;
  result = tournamentEngine.executionQueue(methods);
  expect(result.results[0].cannotRemove).toEqual(individualParticipantIds);
});

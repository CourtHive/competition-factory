import { getModifiedMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getModifiedMatchUpTiming';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import {
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
  UNRECOGNIZED_MATCHUP_FORMAT,
} from '@Constants/errorConditionConstants';

it('can get modified matchUpTiming', () => {
  // @ts-expect-error no params
  let result = getModifiedMatchUpFormatTiming();
  expect(result.error).toEqual(INVALID_VALUES);

  // @ts-expect-error missing tournament records
  result = getModifiedMatchUpFormatTiming({});
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  // @ts-expect-error missing matchUpFormat
  result = getModifiedMatchUpFormatTiming({ tournamentRecord });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);

  tournamentEngine.setState(tournamentRecord);
  const { event } = tournamentEngine.getEvent({ eventId });

  // @ts-expect-error missing matchUpFormat
  result = getModifiedMatchUpFormatTiming({
    tournamentRecord,
    event,
  });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);
  expect(result.info).toEqual({ param: 'matchUpFormat' });

  result = getModifiedMatchUpFormatTiming({
    matchUpFormat: '',
    tournamentRecord,
    event,
  });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);
});

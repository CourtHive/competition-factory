import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { UNRECOGNIZED_MATCHUP_FORMAT } from '@Constants/errorConditionConstants';

// Refused for new use: overtime the scoring engine does not score (a match clock, Ruling 1); an aggregate of standard
// sets is refused outright. Overtime the engine scores is accepted (activation S6).
const OVERTIME = 'HAL2XA-S:T45P-O:2X/T15P-F:TB1-M:T130';
const SCORED_OVERTIME = 'HAL2XA-S:T45P-O:2X/T15P-F:TB1';
const AGGREGATE_STANDARD_SETS = 'SET3XA-S:6/TB7';
const VALID = 'SET3-S:6/TB7';

it.each([OVERTIME, AGGREGATE_STANDARD_SETS])(
  'addEvent refuses an event.matchUpFormat refused for new use: %s',
  (matchUpFormat) => {
    mocksEngine.generateTournamentRecord({ setState: true });

    let result: any = tournamentEngine.addEvent({ event: { eventName: 'E', matchUpFormat } });
    expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);
    expect(tournamentEngine.getTournament().tournamentRecord.events ?? []).toEqual([]);

    result = tournamentEngine.addEvent({ event: { eventName: 'E', matchUpFormat: VALID } });
    expect(result.success).toEqual(true);
  },
);

it('addEvent accepts an overtime format the scoring engine scores', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  const result: any = tournamentEngine.addEvent({ event: { eventName: 'E', matchUpFormat: SCORED_OVERTIME } });
  expect(result.success).toEqual(true);
});

it('generateDrawDefinition validates a passed matchUpFormat even when it equals the event format', () => {
  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ eventProfiles: [{ participantsProfile: { participantsCount: 8 } }] });

  // a record that already stores a refused format (imported, or written before this check existed)
  tournamentRecord.events[0].matchUpFormat = OVERTIME;
  tournamentEngine.setState(tournamentRecord);

  // passing the format is new use, equal to the event's or not
  let result: any = tournamentEngine.generateDrawDefinition({ eventId, matchUpFormat: OVERTIME });
  expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);

  // a draw that inherits the stored format reads it; refusals apply where a format is set, not where it is read
  result = tournamentEngine.generateDrawDefinition({ eventId });
  expect(result.success).toEqual(true);
});

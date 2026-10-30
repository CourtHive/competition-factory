import tournamentSchema from '@Global/schema/tournament.schema.json';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';

// the record validator the corpus writes against (writeScenario.ts)
const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
ajv.addFormat('date-time', (dateTime: any) => !Number.isNaN(Date.parse(dateTime)));
addFormats(ajv);
const validate = ajv.compile(tournamentSchema);

it('a court closed on some dates, a court closed outright and a closed venue are records the schema accepts', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 3 }, { courtsCount: 1 }],
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    setState: true,
  });
  const { venues } = tournamentEngine.getVenuesAndCourts();
  const [first, second] = venues[0].courts.map(({ courtId }: any) => courtId);

  let result: any = tournamentEngine.disableCourts({ courtIds: [first], dates: ['2026-10-02'] });
  expect(result.success).toEqual(true);
  result = tournamentEngine.disableCourts({ courtIds: [second] });
  expect(result.success).toEqual(true);
  result = tournamentEngine.disableVenues({ venueIds: [venues[1].venueId] });
  expect(result.success).toEqual(true);

  const { tournamentRecord } = tournamentEngine.getTournament();
  const courts = tournamentRecord.venues[0].courts;
  expect(courts.find(({ courtId }: any) => courtId === first).disabled).toEqual({ dates: ['2026-10-02'] });
  expect(courts.find(({ courtId }: any) => courtId === second).disabled).toEqual(true);
  expect(tournamentRecord.venues[1].disabled).toEqual(true);

  const valid = validate(tournamentRecord);
  expect({ valid, errors: ajv.errorsText(validate.errors) }).toEqual({ valid: true, errors: 'No errors' });
});

it('refuses a disabled that is neither true/false nor { dates }', () => {
  const court = (disabled: unknown) => ({
    tournamentId: 't',
    tournamentName: 't',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    venues: [{ venueId: 'v', courts: [{ courtId: 'c', disabled }] }],
  });
  expect(validate(court({ dates: ['2026-10-02'] }))).toEqual(true);
  expect(validate(court('2026-10-02'))).toEqual(false);
  expect(validate(court({ from: '2026-10-02' }))).toEqual(false);
});

import { mocksEngine } from '@Assemblies/engines/mock';
import { defined } from '@Tests/helpers/defined';
import addFormats from 'ajv-formats';
import { expect, it } from 'vitest';
import fs from 'fs-extra';
import Ajv from 'ajv';

/**
 * Live scoring records the current game's points on the matchUp's score (`score.side1PointScore`), and the factory
 * carries them forward on purpose (matchUpScore.ts). CODES `Score` declares them (CA, 2026-10-25), so a record that
 * carries them must validate; before they were declared, `additionalProperties: false` rejected it.
 */
const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
ajv.addFormat('date-time', (dateTime: any) => !Number.isNaN(Date.parse(dateTime)));
addFormats(ajv);
const validate = ajv.compile(fs.readJsonSync('./src/global/schema/tournament.schema.json'));

it('a matchUp score carrying the current game points validates against tournament.schema.json', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
  const structure = defined(tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.structures?.[0], 'structure');
  const matchUp = defined(structure.matchUps?.[0], 'matchUp');
  matchUp.score = { ...matchUp.score, side1PointScore: '30', side2PointScore: 15 };

  const valid = validate(tournamentRecord);
  expect(validate.errors ?? []).toEqual([]);
  expect(valid).toBe(true);
});

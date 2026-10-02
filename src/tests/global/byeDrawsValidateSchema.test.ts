import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import addFormats from 'ajv-formats';
import { expect, it } from 'vitest';
import fs from 'fs-extra';
import Ajv from 'ajv';

// constants
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
} from '@Constants/drawDefinitionConstants';

/**
 * A DRAW WITH A BYE VALIDATES AGAINST THE CODES SCHEMA.
 *
 * A BYE advances its opponent into round 2 beside a seat nobody has reached, and three writers stored
 * that as `[5, undefined]`, serialised `[5, null]`, which `tournament.schema.json` rejects (`drawPositions`
 * items are numbers). Measured 2026-10-02: every draw type below failed at 15, 13 and 11 of 16. CA ruled
 * the trailing hole be trimmed: `[5]` says the same thing. Validated AFTER a JSON round trip, because
 * that is where `undefined` becomes the `null` the schema sees.
 */
const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
ajv.addFormat('date-time', (dateTime: any) => !Number.isNaN(Date.parse(dateTime)));
addFormats(ajv);
const validate = ajv.compile(fs.readJsonSync('./src/global/schema/tournament.schema.json'));

const DRAW_TYPES = [
  SINGLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
];

it.each(DRAW_TYPES.flatMap((drawType) => [15, 13, 11].map((participantsCount) => ({ drawType, participantsCount }))))(
  '$drawType 16/$participantsCount: a draw with BYEs validates against tournament.schema.json',
  ({ drawType, participantsCount }) => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, drawType, participantsCount }],
      setState: true,
    });
    // a JSON round trip ON PURPOSE: it is what turns a stored `undefined` into the `null` the schema rejects
    // eslint-disable-next-line no-restricted-syntax
    const record = JSON.parse(JSON.stringify(tournamentEngine.getTournament().tournamentRecord));

    // CONTROL: a BYE advanced someone into round 2, so the shape under test is present
    const advanced = record.events[0].drawDefinitions[0].structures[0].matchUps.filter(
      (matchUp: any) => matchUp.roundNumber === 2 && matchUp.drawPositions?.length,
    );
    expect(advanced.length).toBeGreaterThan(0);

    const valid = validate(record);
    expect(valid ? '' : ajv.errorsText(validate.errors)).toEqual('');
  },
);

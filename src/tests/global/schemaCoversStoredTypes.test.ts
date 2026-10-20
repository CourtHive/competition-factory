import { COMPASS } from '@Constants/drawDefinitionConstants';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import ts from 'typescript';
import fs from 'fs-extra';
import Ajv from 'ajv';

// constants
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * EVERY STORED FIELD THE TYPES DECLARE, THE SCHEMA DECLARES.
 *
 * A closed schema definition (`additionalProperties: false`, the convention `codesSchemaConvention`
 * enforces) rejects any field it does not list. So a field added to a type and not to the schema
 * makes every record that carries it invalid, and nothing noticed: the schema tests validated only
 * records that held none of them (fresh mocks, the corpus's initial record). Measured 2026-10-20: a
 * COMPASS 16 record validated clean, then failed after one double walkover, on
 * `MatchUp.sideExitProvenance` and `PositionAssignment.byeFromPropagation`; 12 closed definitions
 * lacked typed fields, and only `MatchUp.onlineResources` had ever been added (#5431).
 *
 * The first test compares the two declarations directly; the second validates a record AFTER the
 * engine has written exit provenance, which is the record a consumer stores.
 */

const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }));

/**
 * Typed fields that are never stored, so the schema rightly omits them. Each needs its reason.
 */
const NOT_STORED: Record<string, string> = {
  // hydrated onto in-context matchUps; a stored side carries participantId only
  'Side.participant': 'hydrated',
  // declared `never` so a ladder of awards cannot pass as a list of totals; never set
  'PrizeMoney.finishingPosition': 'never set',
  // END_DATE stays a timeItem (matchUpDuration walks the ordered history); the schema's own description says so
  'MatchUpSchedule.endDate': 'a timeItem',
};

function typedProperties(): Map<string, string[]> {
  const fileName = './src/types/tournamentTypes.ts';
  const program = ts.createProgram([fileName], { strict: true, noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(fileName);
  const properties = new Map<string, string[]>();
  source?.forEachChild((node) => {
    if (!ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node)) return;
    const type = checker.getTypeAtLocation(node.name);
    properties.set(
      node.name.text,
      checker.getPropertiesOfType(type).map((property) => property.name),
    );
  });
  return properties;
}

describe('the schema declares what the types store', () => {
  it('every closed definition lists every field its type declares', () => {
    const typed = typedProperties();
    const compared: string[] = [];
    const missing: string[] = [];
    for (const [name, definition] of Object.entries<any>(schema.definitions)) {
      if (definition.additionalProperties !== false || !definition.properties || !typed.has(name)) continue;
      compared.push(name);
      for (const field of typed.get(name) ?? []) {
        const key = `${name}.${field}`;
        if (!(field in definition.properties) && !NOT_STORED[key]) missing.push(key);
      }
    }
    // the comparison must actually compare: a parse that found no types would pass vacuously
    expect(compared.length).toBeGreaterThan(40);
    expect(compared).toEqual(expect.arrayContaining(['MatchUp', 'PositionAssignment', 'Participant']));
    expect(missing).toEqual([]);
  });

  it('a record holding exit provenance and a propagated BYE validates', () => {
    const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
    ajv.addFormat('date-time', (dateTime: any) => !Number.isNaN(Date.parse(dateTime)));
    addFormats(ajv);
    const validate = ajv.compile(schema);

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'compass', drawType: COMPASS, drawSize: 16 }],
      setState: true,
    });
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const first: any = matchUps.find(
      (matchUp: any) => matchUp.structureName === 'East' && matchUp.roundNumber === 1 && matchUp.roundPosition === 1,
    );
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: first.matchUpId,
      propagateExitStatus: true,
      drawId: 'compass',
    });
    expect(result.success).toEqual(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    const stored = JSON.stringify(tournamentRecord);
    // CONTROL: the record holds the fields that failed validation before they were declared
    expect(stored).toContain('"sideExitProvenance"');
    expect(stored).toContain('"byeFromPropagation"');

    result = validate(tournamentRecord);
    expect(result, ajv.errorsText(validate.errors)).toEqual(true);
  });
});

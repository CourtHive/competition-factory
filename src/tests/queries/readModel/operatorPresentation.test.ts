import { operatorDrawPresentation, operatorMatchPresentation } from '@Query/readModel/operatorPresentation';
import { operatorPresentationSchemas } from '@Query/readModel/operatorPresentationSchema';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { getMatchUpUpset } from '@Query/matchUp/getMatchUpUpset';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

function match(overrides: Partial<HydratedMatchUp> = {}): HydratedMatchUp {
  return {
    tournamentId: 't',
    eventId: 'e',
    drawId: 'd',
    structureId: 's',
    matchUpId: 'm',
    roundNumber: 1,
    roundPosition: 1,
    matchUpStatus: 'COMPLETED',
    matchUpType: 'SINGLES',
    matchUpFormat: 'SET3-S:6/TB7',
    winningSide: 1,
    score: {
      sets: [
        { setNumber: 2, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
      ],
    },
    sides: [
      {
        sideNumber: 1,
        participantId: 'p1',
        participant: {
          participantId: 'p1',
          participantName: 'A',
          person: { personId: 'person-a', contacts: [{ emailAddress: 'private@example.test' }] },
        },
      },
      { sideNumber: 2, participantId: 'p2', seedValue: 1, participant: { participantId: 'p2', participantName: 'B' } },
    ],
    ...overrides,
  };
}

function projectMatch(input: HydratedMatchUp, options: { venueTimeZone?: string } = {}) {
  const result = operatorMatchPresentation(input, { audience: 'recorder', ...options });
  expect(result.error).toBeUndefined();
  return result.presentation!;
}

function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}

describe('operator presentation — canonical factory decisions, explicit display fields', () => {
  it('does not mutate a deeply frozen input, including an unsorted score array', () => {
    const input = match();
    freeze(input);
    const view = projectMatch(input);
    expect(view.scoreText).toBe('6-4 6-3');
    expect(input.score?.sets?.map((set) => set.setNumber)).toEqual([2, 1]);
    expect(view.hasScore).toBe(checkScoreHasValue({ matchUp: input }));
    expect(view.isUpset).toBe(getMatchUpUpset({ matchUp: input }).isUpset);
    expect(view.isUpset).toBe(true);
    expect(view.sides.map((side) => side.isWinner)).toEqual([true, false]);
    expect(JSON.stringify(view)).not.toContain('private@example.test');
    expect(JSON.stringify(view)).not.toContain('person-a');
    expect(view).not.toHaveProperty('validActions');
  });

  it.each(['RETIRED', 'WALKOVER', 'TO_BE_PLAYED'] as const)('does not invent upset/score presence for %s', (status) => {
    const input = match({ matchUpStatus: status, score: { sets: [] } });
    const view = projectMatch(input);
    expect(view.hasScore).toBe(checkScoreHasValue({ matchUp: input }));
    expect(view.isUpset).toBe(getMatchUpUpset({ matchUp: input }).isUpset);
  });

  it('preserves BYE/qualifier identities and empty sides without substituting participant names', () => {
    const view = projectMatch(match({ winningSide: undefined, sides: [{ sideNumber: 2, qualifier: true }] }));
    expect(view.sides[0].name).toBeUndefined();
    expect(view.sides[0].isWinner).toBe(false);
    expect(view.sides[1].qualifier).toBe(true);
    expect(projectMatch(match({ sides: [{ sideNumber: 1, bye: true }] })).sides[0].bye).toBe(true);
  });

  it('uses factory round and match order, not the input array order', () => {
    const input = [
      match({ matchUpId: 'final', roundNumber: 2, roundPosition: 1 }),
      match({ matchUpId: 'second', roundPosition: 2 }),
      match({ matchUpId: 'first', roundPosition: 1 }),
    ];
    freeze(input);
    let result: any = operatorDrawPresentation({
      audience: 'recorder',
      drawId: 'd',
      structureId: 's',
      matchUps: input,
    });
    expect(result.error).toBeUndefined();
    expect(result.presentation.rounds.map((round) => round.roundNumber)).toEqual([1, 2]);
    expect(result.presentation.rounds[0].matches.map((item) => item.matchUpId)).toEqual(['first', 'second']);
    expect(input.map((item) => item.matchUpId)).toEqual(['final', 'second', 'first']);
  });

  it('honors canonical TEAM-level filtering instead of displaying its rubbers twice', () => {
    let result: any = operatorDrawPresentation({
      audience: 'recorder',
      drawId: 'd',
      structureId: 's',
      matchUps: [
        match({ matchUpId: 'dual', matchUpType: 'TEAM' }),
        match({ matchUpId: 'rubber', matchUpType: 'SINGLES' }),
      ],
    });
    expect(result.presentation.rounds[0].matches.map((item) => item.matchUpId)).toEqual(['dual']);
  });

  it.each([undefined, 0, -1, 1.5])(
    'refuses an unrepresentable round %s rather than dropping its match',
    (roundNumber) => {
      let result: any = operatorDrawPresentation({
        audience: 'recorder',
        drawId: 'd',
        structureId: 's',
        matchUps: [match({ roundNumber })],
      });
      expect(result.error).toBe(INVALID_VALUES);
      expect(result.presentation).toBeUndefined();
    },
  );

  it('forwards producer-resolved venue zones without falling back to a browser or tournament guess', () => {
    const input = match({ schedule: { scheduledDate: '2026-11-20', scheduledTime: '10:30', venueId: 'v1' } });
    const view = projectMatch(input, { venueTimeZone: 'America/New_York' });
    expect(view.schedule?.timeZone).toBe('America/New_York');
    expect(projectMatch(input).schedule?.timeZone).toBeUndefined();
    let result: any = operatorDrawPresentation({
      audience: 'recorder',
      drawId: 'd',
      structureId: 's',
      matchUps: [input],
      venueTimeZones: { v1: 'Asia/Tokyo' },
    });
    expect(result.presentation.rounds[0].matches[0].schedule.timeZone).toBe('Asia/Tokyo');
  });

  it('returns an explicit empty structure and refuses mixed contexts or duplicate identities', () => {
    let result: any = operatorDrawPresentation({ audience: 'recorder', drawId: 'd', structureId: 's', matchUps: [] });
    expect(result.presentation.rounds).toEqual([]);
    for (const matchUps of [[match(), match()], [match({ structureId: 'other' })], [match({ drawId: 'other' })]]) {
      result = operatorDrawPresentation({ audience: 'recorder', drawId: 'd', structureId: 's', matchUps });
      expect(result.error).toBe(INVALID_VALUES);
      expect(result.presentation).toBeUndefined();
    }
  });
});

describe('operator presentation exposure — declared audience and serialized schema', () => {
  const ajv = new Ajv({ strict: true, allErrors: true });
  function json(value: unknown) {
    // Validate the serialized wire body, including omission of undefined fields.
    const body = JSON.stringify(value);
    return JSON.parse(body);
  }
  // Independent screen policy: widening the production schema alone must not bless a new field.
  const matchFields = [
    'audience',
    'matchUpId',
    'roundPosition',
    'status',
    'scoreText',
    'hasScore',
    'isUpset',
    'sides',
    'schedule',
  ];
  const sorted = (fields: string[]) => fields.toSorted((a, b) => a.localeCompare(b, 'en'));
  function assertMatchPolicy(schema: typeof operatorPresentationSchemas.recorder.match) {
    expect(sorted(Object.keys(schema.properties))).toEqual(sorted(matchFields));
    expect(sorted(Object.keys(schema.properties.sides.items.properties))).toEqual(
      sorted(['sideNumber', 'participantId', 'name', 'seed', 'bye', 'qualifier', 'isWinner']),
    );
    expect(sorted(Object.keys(schema.properties.schedule.properties))).toEqual(
      sorted(['date', 'time', 'timeZone', 'court', 'venue']),
    );
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.sides.items.additionalProperties).toBe(false);
    expect(schema.properties.schedule.additionalProperties).toBe(false);
  }

  it.each(['recorder', 'director'] as const)('builds only the %s screen allow-list from broad input', (audience) => {
    const input = match({ schedule: { scheduledDate: '2026-11-20', scheduledTime: '10:30' } });
    Object.assign(input, { directorNotes: 'director-canary' });
    Object.assign(input.sides![0].participant!, { birthDate: '1995-02-03', phoneNumber: 'protected-phone' });
    const result = operatorDrawPresentation({ audience, drawId: 'd', structureId: 's', matchUps: [input] });
    expect(result.error).toBeUndefined();
    const payload = json(result.presentation);
    const schema = operatorPresentationSchemas[audience];
    expect(ajv.compile(schema.draw)(payload)).toBe(true);
    assertMatchPolicy(schema.match);
    for (const canary of ['director-canary', '1995-02-03', 'protected-phone', 'private@example.test', 'person-a']) {
      expect(JSON.stringify(payload)).not.toContain(canary);
    }
    expect(payload.audience).toBe(audience);
    expect(payload.rounds[0].matches[0].audience).toBe(audience);
  });

  it.each([undefined, 'public', 'administrator', '__proto__', 'constructor', null])(
    'refuses undeclared audience %s without a fallback payload',
    (audience) => {
      for (const result of [
        Reflect.apply(operatorMatchPresentation, undefined, [match(), { audience }]),
        Reflect.apply(operatorDrawPresentation, undefined, [{ audience, drawId: 'd', structureId: 's', matchUps: [] }]),
      ]) {
        expect(result.error).toBe(INVALID_VALUES);
        expect(Object.keys(result)).toEqual(['error']);
      }
    },
  );

  it('detects planted director fields in recorder output and a deliberately widened recorder schema', () => {
    const schema = operatorPresentationSchemas.recorder.match;
    const view = json(projectMatch(match()));
    const exposed = { ...view, directorNotes: 'director-only' };
    expect(ajv.compile(schema)(exposed)).toBe(false); // built-output schema must fail on the plant
    const broadened = { ...schema, properties: { ...schema.properties, directorNotes: { type: 'string' } } };
    expect(ajv.compile(broadened)(exposed)).toBe(true); // prove why the independent policy oracle is necessary
    expect(() => assertMatchPolicy(broadened)).toThrow();
  });

  it('rejects planted nested fields and a director payload mislabeled for recorder delivery', () => {
    const matchSchema = operatorPresentationSchemas.recorder.match;
    const view = json(projectMatch(match()));
    view.sides[0].contacts = [{ emailAddress: 'private@example.test' }];
    expect(ajv.compile(matchSchema)(view)).toBe(false);
    const director = operatorDrawPresentation({
      audience: 'director',
      drawId: 'd',
      structureId: 's',
      matchUps: [match()],
    });
    expect(ajv.compile(operatorPresentationSchemas.recorder.draw)(json(director.presentation))).toBe(false);
  });

  it('does not carry a protected object through a field declared as display text', () => {
    const input = match();
    Reflect.set(input.sides![0].participant!, 'participantName', { contacts: ['protected-canary'] });
    const payload = json(projectMatch(input));
    expect(ajv.compile(operatorPresentationSchemas.recorder.match)(payload)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('protected-canary');
  });
});

import { generatePairParticipantName } from '@Functions/participants/generatePairParticipantName';
import { describe, it, expect } from 'vitest';

// constants
import { FEMALE, MALE, OTHER } from '@Constants/genderConstants';

const member = (participantId: string, standardFamilyName: string, sex?: string) => ({
  person: { standardFamilyName, ...(sex ? { sex } : {}) },
  participantId,
});

describe('same-sex pairs are alphabetical by surname', () => {
  it('orders two surnames alphabetically regardless of the order supplied', () => {
    const individualParticipants = [member('p1', 'Salisbury', MALE), member('p2', 'Cash', MALE)];

    expect(generatePairParticipantName({ individualParticipants })).toEqual('Cash/Salisbury');

    // reversing the input must not change the output — that is the whole point
    expect(generatePairParticipantName({ individualParticipants: individualParticipants.toReversed() })).toEqual(
      'Cash/Salisbury',
    );
  });

  it('is alphabetical rather than ranking- or seniority-based', () => {
    // The Olympic draw lists these alphabetically though every report led with
    // Nadal and with Murray. Encoded here so the convention is not "fixed" later.
    expect(
      generatePairParticipantName({
        individualParticipants: [member('p1', 'Nadal', MALE), member('p2', 'Alcaraz', MALE)],
      }),
    ).toEqual('Alcaraz/Nadal');

    expect(
      generatePairParticipantName({
        individualParticipants: [member('p1', 'Murray', MALE), member('p2', 'Evans', MALE)],
      }),
    ).toEqual('Evans/Murray');
  });
});

describe('collation is locale-aware, not code-unit order', () => {
  // A bare `.sort()` compares UTF-16 code units, which files every diacritic
  // after `z`. Both of these came back reversed before the shared generator.
  it.each([
    { a: 'Göransson', b: 'Granollers', expectation: 'Göransson/Granollers' },
    { a: 'Öberg', b: 'Olsson', expectation: 'Öberg/Olsson' },
  ])('orders $a and $b as $expectation', ({ a, b, expectation }) => {
    expect(
      generatePairParticipantName({ individualParticipants: [member('p1', a, MALE), member('p2', b, MALE)] }),
    ).toEqual(expectation);

    // and UTF-16 code-unit order would NOT produce it — pins why the collator
    // is there. Spelled as an explicit comparator rather than a bare `.sort()`,
    // which the standards forbid even when demonstrating its behaviour.
    const codeUnitOrder = (x: string, y: string) => {
      if (x < y) return -1;
      return x > y ? 1 : 0;
    };
    expect([a, b].sort(codeUnitOrder).join('/')).not.toEqual(expectation);
  });

  it('does not disturb pairs a bare sort already ordered correctly', () => {
    expect(
      generatePairParticipantName({
        individualParticipants: [member('p1', 'Mektić', MALE), member('p2', 'Melo', MALE)],
      }),
    ).toEqual('Mektić/Melo');
  });
});

describe('mixed pairs list the woman first, overriding alphabetical', () => {
  it.each([
    { woman: 'Świątek', man: 'Ruud' },
    { woman: 'Pegula', man: 'Draper' },
    { woman: 'Rybakina', man: 'Fritz' },
    { woman: 'Raducanu', man: 'Alcaraz' },
  ])('lists $woman before $man though alphabetical would not', ({ woman, man }) => {
    const individualParticipants = [member('p1', man, MALE), member('p2', woman, FEMALE)];

    expect(generatePairParticipantName({ individualParticipants })).toEqual(`${woman}/${man}`);

    // each of these is a real break of alphabetical, which is what makes it a test
    expect([woman, man].sort((a, b) => a.localeCompare(b, 'en')).join('/')).not.toEqual(`${woman}/${man}`);
  });

  it('still lists the woman first when she is also alphabetically first', () => {
    expect(
      generatePairParticipantName({
        individualParticipants: [member('p1', 'Errani', FEMALE), member('p2', 'Vavassori', MALE)],
      }),
    ).toEqual('Errani/Vavassori');
  });

  it('accepts the abbreviated sex values', () => {
    expect(
      generatePairParticipantName({
        individualParticipants: [member('p1', 'Ruud', 'M'), member('p2', 'Świątek', 'F')],
      }),
    ).toEqual('Świątek/Ruud');
  });
});

describe('falls back to alphabetical when a pair is not male/female', () => {
  it.each([
    { label: 'sex absent on both', a: undefined, b: undefined },
    { label: 'sex absent on one', a: MALE, b: undefined },
    { label: 'OTHER is present', a: OTHER, b: MALE },
    { label: 'both female', a: FEMALE, b: FEMALE },
    { label: 'both male', a: MALE, b: MALE },
  ])('$label', ({ a, b }) => {
    expect(
      generatePairParticipantName({
        individualParticipants: [member('p1', 'Zeballos', a), member('p2', 'Granollers', b)],
      }),
    ).toEqual('Granollers/Zeballos');
  });
});

describe('member resolution', () => {
  it('filters to individualParticipantIds when supplied', () => {
    const individualParticipants = [
      member('p1', 'Cash', MALE),
      member('p2', 'Glasspool', MALE),
      member('p3', 'Salisbury', MALE),
    ];

    expect(generatePairParticipantName({ individualParticipantIds: ['p1', 'p3'], individualParticipants })).toEqual(
      'Cash/Salisbury',
    );
  });

  it('ignores ids that resolve to no member', () => {
    expect(
      generatePairParticipantName({
        individualParticipantIds: ['p1', 'missing'],
        individualParticipants: [member('p1', 'Cash', MALE)],
      }),
    ).toEqual('Cash/Unknown');
  });

  it('appends /Unknown for a single member', () => {
    expect(generatePairParticipantName({ individualParticipants: [member('p1', 'Cash', MALE)] })).toEqual(
      'Cash/Unknown',
    );
  });

  it('returns an empty string when no member contributes a name', () => {
    expect(generatePairParticipantName({ individualParticipants: [] })).toEqual('');
    expect(generatePairParticipantName({})).toEqual('');
    expect(generatePairParticipantName({ individualParticipants: [{ participantId: 'p1' }] })).toEqual('');
  });

  it('falls back through participantOtherName then participantName', () => {
    expect(
      generatePairParticipantName({
        individualParticipants: [
          { participantId: 'p1', participantOtherName: 'Cash' },
          { participantId: 'p2', participantName: 'Glasspool' },
        ],
      }),
    ).toEqual('Cash/Glasspool');
  });

  it('prefers standardFamilyName over the alternates', () => {
    expect(
      generatePairParticipantName({
        individualParticipants: [
          { participantId: 'p1', participantOtherName: 'Zeballos', person: { standardFamilyName: 'Cash' } },
          { participantId: 'p2', participantName: 'Glasspool' },
        ],
      }),
    ).toEqual('Cash/Glasspool');
  });
});

import { attributeFilter } from '@Tools/attributeFilter';
import { expect, it } from 'vitest';

import { INDIVIDUAL } from '@Constants/participantConstants';
import { MALE } from '@Constants/genderConstants';

const timeStamp = '0001-01-01T00:00:00';
const birthDate = '2026-09-04';
const Ivan = 'Ivan Illich';

it('handles bad data', () => {
  let result = attributeFilter();
  expect(result).toBeUndefined();
  result = attributeFilter('');
  expect(result).toBeUndefined();
  result = attributeFilter(null);
  expect(result).toEqual({});
  result = attributeFilter(undefined);
  expect(result).toBeUndefined();
  result = attributeFilter(1);
  expect(result).toBeUndefined();
});

it('can filter attributes from arrays of object', () => {
  const privacy = {
    participantName: true,
    participantId: true,
    participantRole: false,
    participantStatus: false,
    participantType: true,
    person: {
      addresses: {
        city: 'Cuernavaca',
        state: 'Morelos',
        countryCode: false,
        addressLine1: false,
        addressLine2: false,
      },
      birthDate: false,
      nationalityCode: true,
      nativeFamilyName: false,
      nativeGivenName: false,
      sex: false,
      standardFamilyName: true,
      standardGivenName: true,
    },
  };
  const participant = {
    participantName: Ivan,
    participantId: '1234567',
    participantRole: 'Educator',
    participantStatus: 'Deceased',
    participantType: INDIVIDUAL,
    person: {
      addresses: [
        {
          city: 'Cuernavaca',
          state: 'Morelos',
          countryCode: 'MEX',
          addressLine1: 'P.O. Box 1234',
          addressLine2: 'Some Street',
        },
      ],
      standardFamilyName: 'Illich',
      standardGivenName: 'Ivan',
      nativeFamilyName: 'Illich',
      nativeGivenName: 'Ivan',
      nationalityCode: 'AUT',
      birthDate,
      sex: MALE,
    },
  };

  const filteredParticipant = attributeFilter({
    source: participant,
    template: privacy,
  });

  const expectedParticipant = {
    participantName: Ivan,
    participantId: '1234567',
    participantType: 'INDIVIDUAL',
    person: {
      addresses: [{ city: 'Cuernavaca', state: 'Morelos' }],
      nationalityCode: 'AUT',
      standardFamilyName: 'Illich',
      standardGivenName: 'Ivan',
    },
  };

  expect(filteredParticipant).toEqual(expectedParticipant);
});

it('supports templates which contain objects not present in source', () => {
  const privacy = {
    participantName: true,
    participantId: true,
    participantRole: false,
    participantStatus: false,
    participantType: true,
    person: {
      addresses: {
        city: 'Cuernavaca',
        state: 'Morelos',
        countryCode: false,
        addressLine1: false,
        addressLine2: false,
      },
      birthDate: false,
      nationalityCode: true,
      nativeFamilyName: false,
      nativeGivenName: false,
      sex: false,
      standardFamilyName: true,
      standardGivenName: true,
    },
  };
  const participant = {
    participantName: Ivan,
    participantId: '1234567',
    participantRole: 'Educator',
    participantStatus: 'Deceased',
    participantType: INDIVIDUAL,
    person: {
      standardFamilyName: 'Illich',
      nativeFamilyName: 'Illich',
      standardGivenName: 'Ivan',
      nativeGivenName: 'Ivan',
      nationalityCode: 'AUT',
      birthDate,
      sex: MALE,
    },
  };

  const filteredParticipant = attributeFilter({
    source: participant,
    template: privacy,
  });

  const expectedParticipant = {
    participantName: Ivan,
    participantId: '1234567',
    participantType: 'INDIVIDUAL',
    person: {
      nationalityCode: 'AUT',
      standardFamilyName: 'Illich',
      standardGivenName: 'Ivan',
    },
  };

  expect(filteredParticipant).toEqual(expectedParticipant);
});

it('supports sources which contain attributes not present in templates', () => {
  const privacy = {
    participantName: true,
    participantId: true,
    participantRole: false,
    participantStatus: false,
    participantType: true,
    person: {
      birthDate: false,
      nationalityCode: true,
      nativeFamilyName: false,
      nativeGivenName: false,
      sex: false,
      standardFamilyName: true,
      standardGivenName: true,
    },
  };
  const participant = {
    participantName: Ivan,
    participantId: '1234567',
    participantRole: 'Educator',
    participantStatus: 'Deceased',
    participantType: INDIVIDUAL,
    person: {
      addresses: [
        {
          city: 'Cuernavaca',
          state: 'Morelos',
          countryCode: 'MEX',
          addressLine1: 'P.O. Box 1234',
          addressLine2: 'Some Street',
        },
      ],
      standardFamilyName: 'Illich',
      nativeFamilyName: 'Illich',
      standardGivenName: 'Ivan',
      nativeGivenName: 'Ivan',
      nationalityCode: 'AUT',
      sex: MALE,
      birthDate,
    },
  };

  const filteredParticipant = attributeFilter({
    source: participant,
    template: privacy,
  });

  const expectedParticipant = {
    participantName: Ivan,
    participantId: '1234567',
    participantType: 'INDIVIDUAL',
    person: {
      nationalityCode: 'AUT',
      standardFamilyName: 'Illich',
      standardGivenName: 'Ivan',
    },
  };

  expect(filteredParticipant).toEqual(expectedParticipant);
});

it('can apply the same filter template to multiple attributes', () => {
  const source = {
    ratings: {
      DOUBLES: [
        {
          scaleValue: {
            wtnRating: 29.35,
            confidence: 70,
            gameZoneLower: 31.14,
            gameZoneUpper: 27.57,
          },
          scaleName: 'WTN',
        },
      ],
      SINGLES: [
        {
          scaleValue: {
            ageCategoryCode: 'OPEN',
            eventSubType: 'SINGLES',
            eventType: 'ADULT',
            confidence: 90,
            wtnRating: 24.52,
            wtnRatingDate: '2022-05-27T09:54:44.383Z',
          },
          scaleName: 'WTN',
        },
        {
          scaleValue: {
            ratingType: 'NTRP',
            benchmarkType: '',
            dntrpRatingHundredths: 0,
            eventSubType: 'SINGLES',
            eventType: 'ADULT',
            ntrpRating: 0,
            ntrpRatingHundredths: 0,
            ratingDate: timeStamp,
            ratingExpiration: timeStamp,
            ratingYear: 0,
            updatedAt: timeStamp,
            ustaRatingType: '',
          },
          scaleName: 'NTRP',
        },
      ],
    },
  };

  let template: any = {
    ratings: {
      'SINGLES||DOUBLES': {
        scaleName: ['WTN'],
        scaleValue: { wtnRating: true },
      },
    },
  };

  let filteredObject = attributeFilter({
    template,
    source,
  });

  expect(filteredObject.ratings.SINGLES).not.toBeUndefined();
  expect(filteredObject.ratings.SINGLES.length).toEqual(1);
  expect(filteredObject.ratings.DOUBLES).not.toBeUndefined();

  template = {
    ratings: {
      'SINGLES||DOUBLES': {
        scaleName: ['WTN', 'NTRP'],
        scaleValue: { wtnRating: true, ntrpRating: true },
      },
    },
  };

  filteredObject = attributeFilter({
    template,
    source,
  });

  expect(filteredObject.ratings.SINGLES).not.toBeUndefined();
  expect(filteredObject.ratings.SINGLES.length).toEqual(2);
  expect(filteredObject.ratings.DOUBLES).not.toBeUndefined();

  template = {
    ratings: {
      'SINGLES||DOUBLES': {
        scaleName: ['NTRP'],
        scaleValue: {
          '*': true,
          ntrpRatingHundredths: false,
          dntrpRatingHundredths: false,
        },
      },
    },
  };

  filteredObject = attributeFilter({
    template,
    source,
  });

  expect(filteredObject.ratings.SINGLES.length).toEqual(1);

  const rating = filteredObject.ratings.SINGLES[0];
  expect(rating.scaleName).toEqual('NTRP');
  expect(rating.scaleValue.ntrpRatingHundredths).toBeUndefined();
  expect(rating.scaleValue.dntrpRatingHundredths).toBeUndefined();
  expect(rating.scaleValue.eventType).toEqual('ADULT');
});

// ============================================================================
// EDGE CASE TESTS FOR FULL COVERAGE
// ============================================================================

it('handles empty string vs null vs undefined differences', () => {
  const source = {
    emptyStr: '',
    nullVal: null,
    undefinedVal: undefined,
    zero: 0,
    falsy: false,
  };

  const template = {
    emptyStr: true,
    nullVal: true,
    undefinedVal: true,
    zero: true,
    falsy: true,
  };

  const result = attributeFilter({ source, template });
  expect(result.emptyStr).toBe('');
  expect(result.nullVal).toBeNull();
  expect(result.undefinedVal).toBeUndefined();
  expect(result.zero).toBe(0);
  expect(result.falsy).toBe(false);
});

it('handles deeply nested object paths', () => {
  const source = {
    a: {
      b: {
        c: {
          d: {
            value: 'deep',
          },
        },
      },
    },
  };

  const template = {
    a: {
      b: {
        c: {
          d: {
            value: true,
          },
        },
      },
    },
  };

  const result = attributeFilter({ source, template });
  expect(result.a.b.c.d.value).toBe('deep');
});

it('handles empty arrays', () => {
  const source = {
    emptyArray: [],
    filledArray: [1, 2, 3],
  };

  const template = {
    emptyArray: true,
    filledArray: true,
  };

  const result = attributeFilter({ source, template });
  expect(result.emptyArray).toEqual([]);
  expect(result.filledArray).toEqual([1, 2, 3]);
});

it('handles complex nested arrays', () => {
  const source = {
    items: [
      { id: 1, name: 'Item 1', secret: 'hidden' },
      { id: 2, name: 'Item 2', secret: 'classified' },
    ],
  };

  const template = {
    items: {
      id: true,
      name: true,
      secret: false,
    },
  };

  const result = attributeFilter({ source, template });
  expect(result.items).toHaveLength(2);
  expect(result.items[0].secret).toBeUndefined();
  expect(result.items[1].name).toBe('Item 2');
});

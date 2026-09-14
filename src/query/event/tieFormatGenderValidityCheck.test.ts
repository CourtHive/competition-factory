import { expect, it } from 'vitest';
import {
  anyMixedError,
  tieFormatGenderValidityCheck,
  mixedGenderError,
} from '@Validators/tieFormatGenderValidityCheck';

// constants
import { DOUBLES_MATCHUP, SINGLES_MATCHUP } from '@Constants/matchUpTypes';
import { ANY, FEMALE, MALE, MIXED } from '@Constants/genderConstants';
import { INVALID_GENDER } from '@Constants/errorConditionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

const referenceEvent = { eventType: TEAM_EVENT, eventId: 'eventId' };

const scenarios = [
  {
    params: {
      referenceGender: MALE,
      gender: MALE,
    },
    expectation: { valid: true },
  },
  {
    params: {
      referenceGender: MALE,
      gender: MIXED,
    },
    expectation: {
      stack: ['tieFormatGenderValidityCheck'],
      context: { gender: MIXED },
      error: INVALID_GENDER,
      valid: false,
    },
  },
  {
    params: {
      referenceGender: MALE,
      gender: ANY,
    },
    expectation: {
      stack: ['tieFormatGenderValidityCheck'],
      context: { gender: ANY },
      error: INVALID_GENDER,
      valid: false,
    },
  },
  {
    params: {
      referenceGender: MALE,
      gender: FEMALE,
    },
    expectation: {
      stack: ['tieFormatGenderValidityCheck'],
      context: { gender: FEMALE },
      error: INVALID_GENDER,
      valid: false,
    },
  },
  {
    params: {
      referenceGender: FEMALE,
      gender: MALE,
    },
    expectation: {
      stack: ['tieFormatGenderValidityCheck'],
      context: { gender: MALE },
      error: INVALID_GENDER,
      valid: false,
    },
  },
  {
    params: {
      referenceGender: FEMALE,
      gender: MIXED,
    },
    expectation: {
      stack: ['tieFormatGenderValidityCheck'],
      context: { gender: MIXED },
      error: INVALID_GENDER,
      valid: false,
    },
  },
  {
    params: {
      referenceGender: FEMALE,
      gender: FEMALE,
    },
    expectation: { valid: true },
  },
  {
    params: {
      referenceGender: FEMALE,
      gender: ANY,
    },
    expectation: {
      stack: ['tieFormatGenderValidityCheck'],
      context: { gender: ANY },
      error: INVALID_GENDER,
      valid: false,
    },
  },
  {
    params: {
      referenceGender: ANY,
      matchUpType: DOUBLES_MATCHUP,
      gender: FEMALE,
    },
    expectation: { valid: true },
  },
  {
    params: {
      referenceGender: ANY,
      matchUpType: SINGLES_MATCHUP,
      gender: FEMALE,
    },
    expectation: { valid: true },
  },
  {
    params: {
      referenceGender: ANY,
      matchUpType: SINGLES_MATCHUP,
      gender: MIXED,
    },
    expectation: {
      info: anyMixedError,
      stack: ['tieFormatGenderValidityCheck'],
      error: INVALID_GENDER,
      valid: false,
    },
  },
  {
    params: {
      referenceGender: ANY,
      matchUpType: DOUBLES_MATCHUP,
      gender: MIXED,
    },
    expectation: { valid: true },
  },
  {
    params: {
      referenceGender: ANY,
      matchUpType: DOUBLES_MATCHUP,
      gender: MALE,
    },
    expectation: { valid: true },
  },
  {
    params: {
      referenceGender: MIXED,
      matchUpType: SINGLES_MATCHUP,
      gender: MIXED,
    },
    expectation: {
      stack: ['tieFormatGenderValidityCheck'],
      error: INVALID_GENDER,
      info: mixedGenderError,
      valid: false,
    },
  },
  {
    params: {
      referenceGender: MIXED,
      matchUpType: DOUBLES_MATCHUP,
      gender: MIXED,
      referenceEvent,
    },
    expectation: { valid: true },
  },
  {
    params: {
      referenceGender: MIXED,
      matchUpType: DOUBLES_MATCHUP,
      gender: FEMALE,
      referenceEvent,
    },
    expectation: { valid: true },
  },
  {
    params: {
      referenceGender: MIXED,
      matchUpType: SINGLES_MATCHUP,
      gender: FEMALE,
      referenceEvent,
    },
    expectation: { valid: true },
  },
  {
    params: {
      referenceGender: MIXED,
      matchUpType: SINGLES_MATCHUP,
      gender: MALE,
      referenceEvent,
    },
    expectation: { valid: true },
  },
  {
    params: {
      referenceGender: MIXED,
      matchUpType: DOUBLES_MATCHUP,
      gender: MALE,
      referenceEvent,
    },
    expectation: { valid: true },
  },
  {
    params: {
      referenceGender: MIXED,
      matchUpType: SINGLES_MATCHUP,
      gender: ANY,
    },
    expectation: {
      stack: ['tieFormatGenderValidityCheck'],
      info: mixedGenderError,
      error: INVALID_GENDER,
      valid: false,
    },
  },
  {
    params: {
      referenceGender: MIXED,
      matchUpType: DOUBLES_MATCHUP,
      gender: ANY,
    },
    expectation: {
      stack: ['tieFormatGenderValidityCheck'],
      info: mixedGenderError,
      error: INVALID_GENDER,
      valid: false,
    },
  },
];

it.each(scenarios)('can test gender validity', (scenario) => {
  const result = tieFormatGenderValidityCheck(scenario.params);
  expect(result).toEqual(scenario.expectation);
});

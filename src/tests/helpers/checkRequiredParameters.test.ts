/**
 * Tests for the `checkRequiredParameters` method.
 * Verifies that the function correctly checks for required parameters and returns the expected results.
 */
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { expect, it } from 'vitest';

// constants
import {
  ANY_OF,
  BYPASS_PARAM_CHECK,
  DRAW_DEFINITION,
  DRAW_ID,
  EVENT,
  EVENT_ID,
  MATCHUP,
  MATCHUPS,
  MATCHUP_ID,
  MATCHUP_IDS,
  ONE_OF,
  PARTICIPANT_ID,
  STRUCTURE,
  STRUCTURES,
  STRUCTURE_ID,
  TOURNAMENT_ID,
  TOURNAMENT_RECORD,
} from '@Constants/attributeConstants';
import {
  EVENT_NOT_FOUND,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_ID,
  MISSING_EVENT,
  MISSING_MATCHUP,
  MISSING_MATCHUPS,
  MISSING_MATCHUP_ID,
  MISSING_MATCHUP_IDS,
  MISSING_PARTICIPANT_ID,
  MISSING_STRUCTURE,
  MISSING_STRUCTURES,
  MISSING_STRUCTURE_ID,
  MISSING_TOURNAMENT_ID,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

it('can check required parameters', () => {
  let result = checkRequiredParameters();
  expect(result.error).toEqual(INVALID_VALUES);

  result = checkRequiredParameters({});
  expect(result.valid).toEqual(true);

  const params = {
    participantId: 'participantId',
    matchUpId: 'matchUpId',
  };
  result = checkRequiredParameters(params);
  expect(result.valid).toEqual(true);

  result = checkRequiredParameters(params, [{ [PARTICIPANT_ID]: true }]);
  expect(result.valid).toEqual(true);

  result = checkRequiredParameters(params, [{ [MATCHUP_ID]: true }]);
  expect(result.valid).toEqual(true);

  result = checkRequiredParameters(params, [{ [PARTICIPANT_ID]: true }, { [MATCHUP_ID]: true }]);
  expect(result.valid).toEqual(true);

  result = checkRequiredParameters(params, [{ [PARTICIPANT_ID]: true, [MATCHUP_ID]: true }]);
  expect(result.valid).toEqual(true);

  result = checkRequiredParameters(params, [{ [DRAW_ID]: true }]);
  expect(result.error).toEqual(MISSING_DRAW_ID);

  result = checkRequiredParameters(params, [{ [PARTICIPANT_ID]: true, [MATCHUP_ID]: true, [DRAW_ID]: true }]);
  expect(result.error).toEqual(MISSING_DRAW_ID);

  result = checkRequiredParameters({}, [{ [TOURNAMENT_RECORD]: true }]);
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

  result = checkRequiredParameters({}, [{ [DRAW_DEFINITION]: true }]);
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);

  result = checkRequiredParameters({}, [{ [PARTICIPANT_ID]: true }]);
  expect(result.error).toEqual(MISSING_PARTICIPANT_ID);

  result = checkRequiredParameters({}, [{ [TOURNAMENT_ID]: true }]);
  expect(result.error).toEqual(MISSING_TOURNAMENT_ID);

  result = checkRequiredParameters({}, [{ [STRUCTURE_ID]: true }]);
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);

  result = checkRequiredParameters({}, [{ [MATCHUP_IDS]: true }]);
  expect(result.error).toEqual(MISSING_MATCHUP_IDS);

  result = checkRequiredParameters({}, [{ [MATCHUP_ID]: true }]);
  expect(result.error).toEqual(MISSING_MATCHUP_ID);

  result = checkRequiredParameters({}, [{ [STRUCTURES]: true }]);
  expect(result.error).toEqual(MISSING_STRUCTURES);

  result = checkRequiredParameters({}, [{ [STRUCTURE]: true }]);
  expect(result.error).toEqual(MISSING_STRUCTURE);

  result = checkRequiredParameters({}, [{ unknownParam: true }]);
  expect(result.error).toEqual(INVALID_VALUES);

  result = checkRequiredParameters({}, [{ [STRUCTURE_ID]: true }]);
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);

  result = checkRequiredParameters({}, [{ [MATCHUP]: true }]);
  expect(result.error).toEqual(MISSING_MATCHUP);

  result = checkRequiredParameters({}, [{ [MATCHUPS]: true }]);
  expect(result.error).toEqual(MISSING_MATCHUPS);

  result = checkRequiredParameters({}, [{ [EVENT_ID]: true }]);
  expect(result.error).toEqual(EVENT_NOT_FOUND);

  result = checkRequiredParameters({}, [{ [EVENT]: true }]);
  expect(result.error).toEqual(MISSING_EVENT);
});

it('can check for one of multiple possible parameters', () => {
  let result = checkRequiredParameters({ [EVENT_ID]: 'eventId' }, [{ [ONE_OF]: { [EVENT_ID]: true, [EVENT]: true } }]);
  expect(result.valid).toEqual(true);
  result = checkRequiredParameters({ [DRAW_ID]: 'drawId' }, [{ [ONE_OF]: { [EVENT_ID]: true, [EVENT]: true } }]);
  expect(result.error).toEqual(INVALID_VALUES);
  result = checkRequiredParameters({ [EVENT_ID]: 'eventId', [DRAW_ID]: 'drawId' }, [
    { [ONE_OF]: { [EVENT_ID]: true, [DRAW_ID]: true } },
  ]);
  expect(result.error).toEqual(INVALID_VALUES);
});

it('can check for one or more of multiple possible parameters', () => {
  let result = checkRequiredParameters({ [EVENT_ID]: 'eventId' }, [{ [ANY_OF]: { [EVENT_ID]: true, [EVENT]: true } }]);
  expect(result.valid).toEqual(true);
  result = checkRequiredParameters({ [DRAW_ID]: 'drawId' }, [{ [ANY_OF]: { [EVENT_ID]: true, [EVENT]: true } }]);
  expect(result.error).toEqual(INVALID_VALUES);
  result = checkRequiredParameters({ [EVENT_ID]: 'eventId', [DRAW_ID]: 'drawId' }, [
    { [ANY_OF]: { [EVENT_ID]: true, [DRAW_ID]: true } },
  ]);
  expect(result.valid).toEqual(true);
});

it('can check required parameter types', () => {
  let result = checkRequiredParameters({ [DRAW_DEFINITION]: 'string' }, [{ [DRAW_DEFINITION]: true }]);
  expect(result.error).toEqual(INVALID_VALUES);

  result = checkRequiredParameters({ [DRAW_DEFINITION]: {} }, [{ [DRAW_DEFINITION]: true }]);
  expect(result.valid).toEqual(true);

  result = checkRequiredParameters({ [MATCHUPS]: {} }, [{ [MATCHUPS]: true }]);
  expect(result.error).toEqual(INVALID_VALUES);

  // checking can be bypassed
  result = checkRequiredParameters({ [MATCHUPS]: {}, [BYPASS_PARAM_CHECK]: true }, [{ [MATCHUPS]: true }]);
  expect(result.valid).toEqual(true);

  result = checkRequiredParameters({ [MATCHUPS]: [] }, [{ [MATCHUPS]: true }]);
  expect(result.valid).toEqual(true);
});

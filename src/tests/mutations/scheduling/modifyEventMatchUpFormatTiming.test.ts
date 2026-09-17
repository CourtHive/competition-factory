import { removeEventMatchUpFormatTiming } from '@Mutate/extensions/events/removeEventMatchUpFormatTiming';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import POLICY_SCORING_USTA from '@Fixtures/policies/POLICY_SCORING_USTA';
import { EVENT_NOT_FOUND, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { SCHEDULE_TIMING } from '@Constants/extensionConstants';

const SHORT4TB10 = 'SET1-S:4/TB10';

it('can modify event timing for matchUpFormat codes', () => {
  const {
    tournamentRecord,
    eventIds: [eventId, eventId2],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }, { drawSize: 16 }],
  });

  let result = tournamentEngine.removeEventMatchUpFormatTiming({
    tournamentRecord,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.removeEventMatchUpFormatTiming({
    tournamentRecord,
  });
  expect(result.error).toEqual(EVENT_NOT_FOUND);

  result = tournamentEngine.removeEventMatchUpFormatTiming({
    tournamentRecord,
    eventId: 'bogusEventId',
  });
  expect(result.error).toEqual(EVENT_NOT_FOUND);

  // @ts-expect-error missing eventId
  result = removeEventMatchUpFormatTiming({ tournamentRecord });
  expect(result.error).toEqual(EVENT_NOT_FOUND);

  result = removeEventMatchUpFormatTiming({
    eventId: eventId2,
    tournamentRecord,
  });
  expect(result.success).toEqual(true);

  result = removeEventMatchUpFormatTiming({
    eventId: 'bogusEventId',
    tournamentRecord,
  });
  expect(result.error).toEqual(EVENT_NOT_FOUND);

  tournamentEngine.setState(tournamentRecord);

  tournamentEngine.attachPolicies({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
  });

  const timingResult = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
  });

  let eventMatchUpFormatTiming = timingResult.eventMatchUpFormatTiming;
  expect(eventMatchUpFormatTiming).not.toBeUndefined();

  result = tournamentEngine.modifyEventMatchUpFormatTiming({
    matchUpFormat: FORMAT_STANDARD,
    averageMinutes: 127,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.modifyEventMatchUpFormatTiming({
    eventId,
    matchUpFormat: SHORT4TB10,
    averageMinutes: 137,
  });
  expect(result.success).toEqual(true);

  // overwriting value of 137 with 117
  result = tournamentEngine.modifyEventMatchUpFormatTiming({
    eventId,
    matchUpFormat: SHORT4TB10,
    averageMinutes: 117,
  });
  expect(result.success).toEqual(true);

  ({ eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
  }));
  expect(eventMatchUpFormatTiming.map((t) => t.averageMinutes)).toEqual([127, 117]);
  expect(eventMatchUpFormatTiming.map((t) => t.recoveryMinutes)).toEqual([60, 60]);

  const { extension } = tournamentEngine.findExtension({
    name: SCHEDULE_TIMING,
    discover: ['event'],
    eventId,
  });
  expect(extension.value.matchUpRecoveryTimes).toEqual([]);

  ({ eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
    matchUpFormats: [FORMAT_STANDARD, SHORT4TB10, SHORT4TB10],
  }));
  // expect duplicated matchUpFormat to be filtered out
  expect(eventMatchUpFormatTiming.map((t) => t.averageMinutes)).toEqual([127, 117]);

  let { methods } = tournamentEngine.getMatchUpFormatTimingUpdate();
  expect(methods.length).toEqual(1);
  expect(methods[0].method).toEqual('addEventExtension');
  expect(methods[0].params.extension.value.matchUpAverageTimes.length).toEqual(2);

  result = tournamentEngine.removeEventMatchUpFormatTiming({});
  expect(result.error).toEqual(EVENT_NOT_FOUND);

  result = tournamentEngine.removeEventMatchUpFormatTiming({
    eventId: 'unknownEventId',
  });
  expect(result.error).toEqual(EVENT_NOT_FOUND);

  result = tournamentEngine.removeEventMatchUpFormatTiming({
    eventId: 'unknownEventId',
  });
  expect(result.error).toEqual(EVENT_NOT_FOUND);

  result = tournamentEngine.removeEventMatchUpFormatTiming({ eventId });
  expect(result.success).toEqual(true);

  ({ methods } = tournamentEngine.getMatchUpFormatTimingUpdate());
  expect(methods.length).toEqual(0);

  ({ eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    matchUpFormats: [FORMAT_STANDARD, SHORT4TB10],
    eventId,
  }));
  expect(eventMatchUpFormatTiming.map((t) => t.averageMinutes)).toEqual([90, 90]);

  result = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
  });
  expect(result.error).toBeUndefined();

  const policyDefinitions = POLICY_SCORING_USTA;
  tournamentEngine.attachPolicies({
    allowReplacement: true,
    policyDefinitions,
  });
  result = tournamentEngine.getAllowedMatchUpFormats({
    categoryName: undefined,
    categoryType: undefined,
  });
  expect(result.length).toBeGreaterThan(0);

  ({ eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
  }));
  expect(policyDefinitions.scoring.matchUpFormats.length).toEqual(eventMatchUpFormatTiming.length);
});

/**
 * `averageMinutes` / `recoveryMinutes` must be NUMERIC, and the guard that decides this used to be
 * `minutes && !isNaN(ensureInt(minutes))`.
 *
 * `ensureInt` returns **0** for anything that is neither a number nor a numeric string — objects,
 * arrays and booleans included — and `isNaN(0)` is `false`. The leading `minutes &&` removes
 * `undefined`, `null`, `0` and `''`, so the obvious cases were safe; what survived was any TRUTHY
 * non-numeric value. It was then stored VERBATIM, so the scheduler later read an object or a
 * boolean where it expects minutes.
 *
 * Same root cause as the hole-accepting predicate fixed in `getOrderedDrawPositions`
 * (#4900): `!isNaN(ensureInt(x))` is not a numeric test. `isNumeric` from `@Tools/math` is.
 *
 * Two lenient cases are deliberately unchanged, because tightening them could reject input a
 * consumer legitimately sends: `'12abc'` parses to 12 and `[5]` stringifies to '5'.
 */
it.each([
  { label: 'a number', minutes: 90, accepted: true, expectation: 'accepted' },
  { label: 'a numeric string', minutes: '90', accepted: true, expectation: 'accepted' },
  { label: 'a non-numeric string', minutes: 'abc', accepted: false, expectation: 'refused' },
  { label: 'an empty object', minutes: {}, accepted: false, expectation: 'refused' },
  { label: 'an array', minutes: [], accepted: false, expectation: 'refused' },
  { label: 'a boolean', minutes: true, accepted: false, expectation: 'refused' },
])('averageMinutes of $label is $expectation', ({ minutes, accepted }) => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], setState: true });

  const result: any = tournamentEngine.modifyEventMatchUpFormatTiming({
    matchUpFormat: FORMAT_STANDARD,
    averageMinutes: minutes,
    eventId,
  });

  if (accepted) {
    expect(result.success).toEqual(true);
  } else {
    expect(result.error).toEqual(INVALID_VALUES);
  }
});

it.each([
  { label: 'an empty object', minutes: {} },
  { label: 'an array', minutes: [] },
  { label: 'a boolean', minutes: true },
])('recoveryMinutes of $label is refused', ({ minutes }) => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], setState: true });

  const result: any = tournamentEngine.modifyEventMatchUpFormatTiming({
    matchUpFormat: FORMAT_STANDARD,
    recoveryMinutes: minutes,
    eventId,
  });

  expect(result.error).toEqual(INVALID_VALUES);
});

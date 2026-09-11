import { firstClassGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { SCHEDULE_TIMING } from '@Constants/extensionConstants';
import { SINGLES } from '@Constants/eventConstants';

// categoryTypes
const JUNIOR = 'JUNIOR';
const ADULT = 'ADULT';

const shortTB10 = 'SET1-S:4/TB10';
const short3TB7 = 'SET3-S:4/TB7';
const set6TB12 = 'SET1-S:6/TB12';

it.each([
  {
    matchUpFormat: FORMAT_STANDARD,
    categoryType: JUNIOR,
    recoveryMinutes: 60,
    categoryName: '18U',
    averageMinutes: 90,
    eventType: SINGLES,
  },
])(
  'can modify matchUpAverageTimes for for matchUpFormats',
  ({ matchUpFormat, categoryName, categoryType, averageMinutes, recoveryMinutes, eventType }) => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 32,
        },
      ],
    });

    let result = tournamentEngine.setState(tournamentRecord).getMatchUpFormatTiming({
      defaultAverageMinutes: 87,
      defaultRecoveryMinutes: 57,
      matchUpFormat,
      categoryName,
      categoryType,
      eventType,
      eventId,
    });
    // Without an attached policy POLICY_SCHEDULING_DEFAULT now acts as the
    // built-in fallback. FORMAT_STANDARD is enumerated there, so the
    // caller-supplied 87/57 defaults are not consulted.
    expect(result.averageMinutes).toEqual(averageMinutes);
    if (recoveryMinutes) {
      expect(result.recoveryMinutes).toEqual(recoveryMinutes);
    }

    result = tournamentEngine.attachPolicies({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.getMatchUpFormatTiming({
      matchUpFormat,
      categoryName,
      categoryType,
      eventType,
      eventId,
    });
    if (averageMinutes) {
      expect(result.averageMinutes).toEqual(averageMinutes);
    }
    if (recoveryMinutes) {
      expect(result.recoveryMinutes).toEqual(recoveryMinutes);
    }

    result = tournamentEngine.modifyMatchUpFormatTiming({
      averageTimes: [{ categoryTypes: [JUNIOR], minutes: { default: 127 } }],
      matchUpFormat,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.getMatchUpFormatTiming({
      matchUpFormat,
    });
    expect(result.averageMinutes).toEqual(90);

    result = tournamentEngine.getMatchUpFormatTiming({
      categoryType: JUNIOR,
      matchUpFormat,
    });
    expect(result.averageMinutes).toEqual(127);

    result = tournamentEngine.getModifiedMatchUpFormatTiming({ matchUpFormat });
    expect(result.averageTimes.length).toEqual(1);
  },
);

it('can modify timing for multiple matchUpFormat codes', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  tournamentEngine.attachPolicies({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
  });
  tournamentEngine.modifyMatchUpFormatTiming({
    averageTimes: [{ categoryTypes: [JUNIOR], minutes: { default: 127 } }],
    matchUpFormat: FORMAT_STANDARD,
  });
  tournamentEngine.modifyMatchUpFormatTiming({
    averageTimes: [{ categoryTypes: [ADULT], minutes: { default: 137 } }],
    matchUpFormat: shortTB10,
  });
  // tournament-level timing is first-class `scheduling.timing` in NATIVE, an extension in LEGACY
  const getTiming = () =>
    firstClassGroupLeafOrExtension({
      element: tournamentEngine.getTournament().tournamentRecord,
      groupAttribute: 'scheduling',
      leafAttribute: 'timing',
      name: SCHEDULE_TIMING,
    });

  expect(getTiming().matchUpAverageTimes.length).toEqual(2);

  tournamentEngine.modifyMatchUpFormatTiming({
    averageTimes: [{ categoryTypes: [ADULT], minutes: { default: 117 } }],
    matchUpFormat: shortTB10,
  });

  expect(getTiming().matchUpAverageTimes.length).toEqual(2);

  tournamentEngine.modifyMatchUpFormatTiming({
    averageTimes: [{ categoryTypes: [ADULT], minutes: { default: 107 } }],
    matchUpFormat: short3TB7,
  });

  expect(getTiming().matchUpAverageTimes.length).toEqual(3);

  let { methods } = tournamentEngine.getMatchUpFormatTimingUpdate();
  expect(methods.length).toEqual(1);

  // now make a modification to a specific event
  tournamentEngine.modifyMatchUpFormatTiming({
    averageTimes: [{ categoryTypes: [ADULT], minutes: { default: 107 } }],
    matchUpFormat: set6TB12,
    eventId,
  });

  // event-level timing remains an extension in all writeModes (only tournament-level is promoted)
  const { extension } = tournamentEngine.findExtension({
    name: SCHEDULE_TIMING,
    discover: ['event'],
    eventId,
  });
  expect(extension.value.matchUpAverageTimes.length).toEqual(1);

  ({ methods } = tournamentEngine.getMatchUpFormatTimingUpdate());
  expect(methods.length).toEqual(2);
});

it('can return matchUpFormatTiming for all matchUpFormats in an event', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  tournamentEngine.attachPolicies({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
  });

  let matchUpFormat = FORMAT_STANDARD;
  tournamentEngine.modifyMatchUpFormatTiming({
    averageTimes: [{ categoryTypes: [JUNIOR], minutes: { default: 127 } }],
    matchUpFormat,
  });

  let result = tournamentEngine.getMatchUpFormatTiming({
    matchUpFormat,
    categoryType: JUNIOR,
  });
  expect(result.averageMinutes).toEqual(127);

  matchUpFormat = shortTB10;
  tournamentEngine.modifyMatchUpFormatTiming({
    averageTimes: [{ categoryTypes: [ADULT], minutes: { default: 137 } }],
    matchUpFormat,
  });

  result = tournamentEngine.getMatchUpFormatTiming({
    matchUpFormat,
    categoryType: ADULT,
  });
  expect(result.averageMinutes).toEqual(137);

  matchUpFormat = short3TB7;
  tournamentEngine.modifyMatchUpFormatTiming({
    averageTimes: [{ categoryTypes: [ADULT], minutes: { default: 107 } }],
    matchUpFormat,
  });

  result = tournamentEngine.getMatchUpFormatTiming({
    categoryType: ADULT,
    matchUpFormat,
  });
  expect(result.averageMinutes).toEqual(107);

  // now make a modification to a specific event
  matchUpFormat = set6TB12;
  tournamentEngine.modifyMatchUpFormatTiming({
    averageTimes: [{ categoryTypes: [ADULT], minutes: { default: 107 } }],
    matchUpFormat,
    eventId,
  });

  result = tournamentEngine.getMatchUpFormatTiming({
    categoryType: ADULT,
    matchUpFormat,
    eventId,
  });
  expect(result.averageMinutes).toEqual(107);

  let { eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
    categoryType: ADULT,
    matchUpFormats: [FORMAT_STANDARD, set6TB12, short3TB7, shortTB10],
  });
  expect(eventMatchUpFormatTiming.map(({ averageMinutes }) => averageMinutes)).toEqual([90, 107, 107, 137]);

  ({ eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    categoryType: ADULT,
    eventId,
    matchUpFormats: [
      { matchUpFormat: shortTB10, description: '1' },
      { matchUpFormat: set6TB12, description: '2' },
      { matchUpFormat: short3TB7, description: '3' },
      { matchUpFormat: FORMAT_STANDARD, description: '4' },
    ],
  }));
  expect(eventMatchUpFormatTiming.map(({ averageMinutes }) => averageMinutes)).toEqual([137, 107, 107, 90]);
  expect(eventMatchUpFormatTiming.map(({ description }) => description)).toEqual(['1', '2', '3', '4']);

  ({ eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    eventId,
    categoryType: JUNIOR,
    matchUpFormats: [shortTB10, set6TB12, short3TB7, FORMAT_STANDARD],
  }));
  expect(eventMatchUpFormatTiming.map(({ averageMinutes }) => averageMinutes)).toEqual([90, 90, 60, 127]);
});

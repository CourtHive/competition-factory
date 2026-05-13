import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';

// categoryTypes
const ADULT = 'ADULT';
const JUNIOR = 'JUNIOR';
const WHEELCHAIR = 'WHEELCHAIR';

it.each([
  {
    matchUpFormat: FORMAT_STANDARD,
    categoryType: JUNIOR,
    averageMinutes: 90,
    recoveryMinutes: 60,
    eventType: DOUBLES,
  },
  {
    matchUpFormat: FORMAT_STANDARD,
    categoryType: JUNIOR,
    averageMinutes: 90,
    recoveryMinutes: 60,
    eventType: SINGLES,
  },
  { matchUpFormat: FORMAT_STANDARD, categoryType: ADULT, averageMinutes: 90 },
  {
    matchUpFormat: FORMAT_STANDARD,
    categoryType: WHEELCHAIR,
    averageMinutes: 90,
  },
])(
  'can retrieve matchUpAverageTimes for for matchUpFormats',
  ({ matchUpFormat, categoryType, averageMinutes, recoveryMinutes, eventType }) => {
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
      categoryType,
      eventType,
      eventId,
    });
    // Without an attached policy POLICY_SCHEDULING_DEFAULT now acts as the
    // built-in fallback, so caller-supplied defaults are only used for
    // formats not enumerated in that policy. FORMAT_STANDARD IS enumerated,
    // so we see the policy value rather than the 87/57 caller defaults.
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
  },
);

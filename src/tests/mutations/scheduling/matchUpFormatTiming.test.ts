import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { EVENT_NOT_FOUND, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

// categoryTypes
const JUNIOR = 'JUNIOR';
// const ADULT = 'ADULT';

test.each([tournamentEngine])(
  'it can find matchUpFormat timing across multiple tournament records',
  async (tournamentEngine) => {
    const drawProfiles = [
      {
        drawSize: 8,
      },
    ];
    const {
      tournamentRecord: firstRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles,
      startDate: '2022-01-01',
      endDate: '2022-01-07',
    });
    const { tournamentRecord: secondRecord } = mocksEngine.generateTournamentRecord({
      startDate: '2022-01-02',
      endDate: '2022-01-10',
    });
    tournamentEngine.setState([firstRecord, secondRecord]);

    let { tournamentRecords } = tournamentEngine.getState();
    const tournamentIds = Object.keys(tournamentRecords);

    const matchUpFormat = FORMAT_STANDARD;
    let result = tournamentEngine.findMatchUpFormatTiming({
      categoryType: JUNIOR,
      matchUpFormat,
    });
    // Without an attached policy, POLICY_SCHEDULING_DEFAULT acts as the
    // built-in fallback. FORMAT_STANDARD for JUNIOR resolves to 90 min
    // average + 60 min recovery from the default policy.
    expect(result.averageMinutes).toEqual(90);
    expect(result.recoveryMinutes).toEqual(60);

    result = tournamentEngine.modifyMatchUpFormatTiming({
      averageTimes: [{ categoryTypes: [JUNIOR], minutes: { default: 127 } }],
      matchUpFormat: FORMAT_STANDARD,
      tournamentId: 'bogusId',
    });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

    result = tournamentEngine.modifyMatchUpFormatTiming({
      averageTimes: [{ categoryTypes: [JUNIOR], minutes: { default: 127 } }],
      matchUpFormat: FORMAT_STANDARD,
      eventId: 'bogusId',
    });
    expect(result.error).toEqual(EVENT_NOT_FOUND);

    result = tournamentEngine.modifyMatchUpFormatTiming({
      averageTimes: [{ categoryTypes: [JUNIOR], minutes: { default: 127 } }],
      matchUpFormat: FORMAT_STANDARD,
    });
    expect(result.success).toEqual(true);

    ({ tournamentRecords } = tournamentEngine.getState());
    expect(tournamentIds.length).toEqual(2);

    tournamentIds.forEach((tournamentId) => {
      const tournamentRecord = tournamentRecords[tournamentId];
      expect(tournamentRecord.extensions[0].value.matchUpAverageTimes.length).toEqual(1);
      tournamentEngine.setTournamentId(tournamentId);
      result = tournamentEngine.getMatchUpFormatTiming({
        matchUpFormat,
        categoryType: JUNIOR,
      });
      expect(result.averageMinutes).toEqual(127);
    });

    result = tournamentEngine.findMatchUpFormatTiming({
      matchUpFormat,
      categoryType: JUNIOR,
    });
    expect(result.averageMinutes).toEqual(127);

    result = tournamentEngine.getMatchUpFormatTimingUpdate();
    expect(result.methods.length).toEqual(1);

    result = tournamentEngine.getEventMatchUpFormatTiming({
      eventId,
      categoryType: JUNIOR,
      matchUpFormats: [matchUpFormat],
    });
    expect(result.eventMatchUpFormatTiming[0].averageMinutes).toEqual(127);
  },
);

// Timed-format defaults derived from the matchUpFormat code itself —
// applies when neither an attached policy nor POLICY_SCHEDULING_DEFAULT
// enumerates the format. Best-of-N timed matches use the worst-case
// total: bestOf × setMinutes (or (bestOf - 1) × setMinutes + finalSetMinutes
// when a final-set time differs), with whole-match -M:T<n> caps winning
// outright.
test.each([
  { matchUpFormat: 'SET1-S:T20', expectedMinutes: 20 },
  { matchUpFormat: 'SET3-S:T15', expectedMinutes: 45 },
  { matchUpFormat: 'SET5-S:T10', expectedMinutes: 50 },
  // Final-set time differs from regular sets.
  { matchUpFormat: 'SET3-S:T15-F:T10', expectedMinutes: 40 },
])(
  'derives default averageMinutes from timed matchUpFormat ($matchUpFormat → $expectedMinutes)',
  ({ matchUpFormat, expectedMinutes }) => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      startDate: '2022-01-01',
      endDate: '2022-01-03',
    });
    tournamentEngine.setState(tournamentRecord);
    const result = tournamentEngine.findMatchUpFormatTiming({ matchUpFormat });
    expect(result.averageMinutes).toEqual(expectedMinutes);
  },
);

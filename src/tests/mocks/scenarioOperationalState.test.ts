import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import {
  CONFLICT_COURT_DOUBLE_BOOKING,
  CONFLICT_COURT_TIME_ORDER,
  CONFLICT_MATCHUP_ORDER,
} from '@Constants/scheduleConstants';

/**
 * A scenario can say what is happening at the anchor, and can ask for a conflict (G3/G4 of the mocksEngine
 * hardening plan). Each conflict is the one the factory's own detector reports, so a fixture keeps
 * exercising `proConflicts` whatever the scheduler does next.
 */

const DATE = '2026-06-01';
const ANCHOR = `${DATE}T09:00`;

function generate(scenarioProfile: any) {
  tournamentEngine.reset();
  const result: any = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: 'v1', courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawId: 'd1', drawSize: 16 }],
    schedulingProfile: [
      {
        scheduleDate: DATE,
        venues: [
          {
            venueId: 'v1',
            rounds: [
              { drawId: 'd1', roundNumber: 1 },
              { drawId: 'd1', roundNumber: 2 },
            ],
          },
        ],
      },
    ],
    scenarioProfile: { anchor: ANCHOR, assignCourts: true, ...scenarioProfile },
    autoSchedule: true,
    nonRandom: 11,
    startDate: DATE,
    endDate: DATE,
    setState: true,
  });
  return result;
}

const issuesFor = () => {
  const matchUps = tournamentEngine.allCompetitionMatchUps({
    matchUpFilters: { scheduledDate: DATE },
    nextMatchUps: true,
    inContext: true,
  }).matchUps;
  return Object.values(tournamentEngine.proConflicts({ matchUps }).rowIssues).flat() as any[];
};

describe('operational state at the anchor', () => {
  it('the matchUps due within the window are called at the anchor, and only those', () => {
    const result = generate({ called: { withinMinutes: 30 } });
    expect(result.success).toEqual(true);
    const calledIds = result.scenarioResult.calledMatchUpIds;
    expect(calledIds.length).toBeGreaterThan(0);

    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const called = matchUps.filter((matchUp: any) => matchUp.schedule?.calledAt);
    expect(called.map(({ matchUpId }: any) => matchUpId).sort((a, b) => a.localeCompare(b))).toEqual(
      [...calledIds].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('the matchUps due within the window have both sides checked in', () => {
    const result = generate({ checkedIn: { withinMinutes: 30 } });
    expect(result.success).toEqual(true);
    const checkedInIds = result.scenarioResult.checkedInMatchUpIds;
    expect(checkedInIds.length).toBeGreaterThan(0);

    for (const matchUpId of checkedInIds) {
      const { matchUp } = tournamentEngine.findMatchUp({ matchUpId, inContext: true });
      const { allParticipantsCheckedIn } = getCheckedInParticipantIds({ matchUp }) as any;
      expect(allParticipantsCheckedIn).toEqual(true);
    }
  });
});

/**
 * The anchored court grid can carry issues of its own (adjacent-row WARNINGs, where a second-round matchUp lands
 * in the row after its sources without time for recovery). So each assertion is about the conflict the profile
 * PLACED: reported for its matchUps after, absent from the same seed before.
 */
const issueKeys = () => new Set(issuesFor().map((issue) => `${issue.issueType}|${issue.matchUpId}`));

describe('deliberate conflicts, as proConflicts reports them', () => {
  for (const type of [CONFLICT_COURT_TIME_ORDER, CONFLICT_COURT_DOUBLE_BOOKING, CONFLICT_MATCHUP_ORDER]) {
    it(type, () => {
      generate({});
      const before = issueKeys();

      const result = generate({ conflicts: [{ type }] });
      expect(result.success).toEqual(true);
      const [placed] = result.scenarioResult.conflicts;
      expect(placed.type).toEqual(type);

      const after = issueKeys();
      const introduced = placed.matchUpIds.filter(
        (matchUpId: string) => after.has(`${type}|${matchUpId}`) && !before.has(`${type}|${matchUpId}`),
      );
      expect(introduced.length).toBeGreaterThan(0);
    });
  }

  it('control: the same seed without conflicts generates the same grid', () => {
    generate({});
    const first = issueKeys();
    generate({});
    expect([...issueKeys()].sort((a, b) => a.localeCompare(b))).toEqual([...first].sort((a, b) => a.localeCompare(b)));
  });

  it('a count places that many', () => {
    const result = generate({ conflicts: [{ type: CONFLICT_COURT_TIME_ORDER, count: 2 }] });
    expect(result.scenarioResult.conflicts.length).toEqual(2);
  });

  it('an unknown conflict type, or conflicts without courts, is refused', () => {
    expect(generate({ conflicts: [{ type: 'RECOVERY_VIOLATION' }] }).error).toEqual(INVALID_VALUES);
    expect(generate({ assignCourts: false, conflicts: [{ type: CONFLICT_COURT_TIME_ORDER }] }).error).toEqual(
      INVALID_VALUES,
    );
  });
});

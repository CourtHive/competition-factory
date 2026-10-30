import { applyScenarioProfile } from '@Assemblies/generators/mocks/applyScenarioProfile';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ANACHRONISM } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * 7.20.0 played a generated tournament's deferred results BETWEEN scheduling and the scenario anchoring (#5731), so:
 * - the rigid shift moved a played first-round matchUp later while its second-round dependent still sat at its old
 *   time, each write was refused as an ANACHRONISM, and `applyScenarioProfile` counted it out and reported success
 *   (measured: `shiftedCount` 8 of 12, the 4 completed matchUps left at 06:00);
 * - the court grid never places a completed matchUp, so every completed matchUp was left without a court.
 */

const day = '2026-09-24';
const drawId = 'D';
const venueId = 'V';

function generate(scenarioProfile?: Record<string, unknown>, venueHours = { startTime: '06:00', endTime: '23:00' }) {
  return mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 16, completionGoal: 4 }],
    venueProfiles: [{ venueId, courtsCount: 8, ...venueHours }],
    schedulingProfile: [
      {
        scheduleDate: day,
        venues: [
          {
            venueId,
            rounds: [
              { drawId, roundNumber: 1 },
              { drawId, roundNumber: 2 },
            ],
          },
        ],
      },
    ],
    autoSchedule: true,
    scenarioProfile,
    startDate: day,
    endDate: day,
    nonRandom: 1,
  });
}

const timeOf = (matchUp: any) => {
  const time = String(matchUp.schedule?.scheduledTime ?? '');
  return time.includes('T') ? time.split('T')[1] : time;
};

function scheduledMatchUps(tournamentRecord: any) {
  tournamentEngine.setState(tournamentRecord);
  return tournamentEngine.allTournamentMatchUps().matchUps.filter((matchUp: any) => matchUp.schedule?.scheduledTime);
}

describe('scenarioProfile over a played, auto-scheduled tournament', () => {
  it('shifts and courts every matchUp, the completed ones included, then plays', () => {
    const result: any = generate({ anchor: `${day}T14:00`, minutesBeforeAnchor: 150, assignCourts: true });
    expect(result.error).toBeUndefined();

    const matchUps = scheduledMatchUps(result.tournamentRecord);
    expect(matchUps.length).toEqual(12);
    expect(result.scenarioResult.shiftedCount).toEqual(matchUps.length);

    const completed = matchUps.filter((matchUp: any) => matchUp.matchUpStatus === COMPLETED);
    expect(completed.length).toEqual(4);
    // every matchUp on a court, a completed one too: the grid ran before the results were applied
    expect(matchUps.every((matchUp: any) => matchUp.schedule?.courtId)).toEqual(true);

    // the earliest is anchor - minutesBeforeAnchor: 14:00 - 150 minutes
    const times = matchUps.map(timeOf).sort();
    expect(times[0]).toEqual('11:30');
    // nothing was left behind at the venue's opening time
    expect(times.includes('06:00')).toEqual(false);

    // and played order holds: no second-round matchUp at or before a completed matchUp feeding it
    for (const source of completed) {
      const dependent = matchUps.find((matchUp: any) => matchUp.matchUpId === source.winnerMatchUpId);
      if (dependent) expect(timeOf(dependent) > timeOf(source)).toEqual(true);
    }
  });
});

describe('applyScenarioProfile judges the played order of the whole shift, not of each step', () => {
  // the record played and scheduled, not anchored; then anchored directly, as a rigid shift either way
  it.each([
    { label: 'later', venueHours: { startTime: '06:00', endTime: '23:00' }, anchor: `${day}T14:00`, first: '13:00' },
    { label: 'earlier', venueHours: { startTime: '15:00', endTime: '23:30' }, anchor: `${day}T09:00`, first: '08:00' },
  ])('a uniform shift $label of played matchUps is written whole', ({ venueHours, anchor, first }) => {
    const { tournamentRecord, error }: any = generate(undefined, venueHours);
    expect(error).toBeUndefined();
    const before = scheduledMatchUps(tournamentRecord);
    expect(before.filter((matchUp: any) => matchUp.matchUpStatus === COMPLETED).length).toEqual(4);

    const result: any = applyScenarioProfile({
      scenarioProfile: { anchor, minutesBeforeAnchor: 60 },
      tournamentRecord,
    });
    expect(result.error).toBeUndefined();
    expect(result.shiftedCount).toEqual(before.length);

    const after = scheduledMatchUps(tournamentRecord);
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const shift = minutes(after.map(timeOf).sort()[0]) - minutes(before.map(timeOf).sort()[0]);
    expect(after.map(timeOf).sort()[0]).toEqual(first);
    for (const matchUp of before) {
      const moved = after.find(({ matchUpId }: any) => matchUpId === matchUp.matchUpId);
      expect(minutes(timeOf(moved))).toEqual(minutes(timeOf(matchUp)) + shift);
    }
  });
});

describe('applyScenarioProfile reports a refused shift instead of swallowing it', () => {
  it('a schedule already out of played order is refused whole, before any matchUp is moved', () => {
    const {
      tournamentRecord,
      drawIds: [singleDrawId],
    }: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      startDate: day,
      endDate: day,
    });
    tournamentEngine.setState(tournamentRecord);
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const final = matchUps.find((matchUp: any) => matchUp.roundNumber === 2);
    const semifinal = matchUps.find((matchUp: any) => matchUp.roundNumber === 1);

    // the final placed BEFORE its semifinal, then the semifinal played: stored out of order. The schedule writes refuse
    // that order (CA 2026-10-30), so it is stored raw, as an import or an older engine would have left it
    const raw = tournamentEngine.getTournament().tournamentRecord;
    for (const matchUp of raw.events[0].drawDefinitions[0].structures[0].matchUps) {
      if (matchUp.matchUpId === final.matchUpId) matchUp.schedule = { scheduledDate: day, scheduledTime: '08:00' };
      if (matchUp.matchUpId === semifinal.matchUpId) matchUp.schedule = { scheduledDate: day, scheduledTime: '10:00' };
    }
    expect(tournamentEngine.setState(raw).success).toEqual(true);
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    const scored = tournamentEngine.setMatchUpStatus({
      matchUpId: semifinal.matchUpId,
      drawId: singleDrawId,
      outcome,
    });
    expect(scored.success).toEqual(true);

    const record = tournamentEngine.getTournament().tournamentRecord;
    const before = scheduledMatchUps(record).map((matchUp: any) => [matchUp.matchUpId, timeOf(matchUp)]);

    const result: any = applyScenarioProfile({
      scenarioProfile: { anchor: `${day}T14:00`, minutesBeforeAnchor: 0 },
      tournamentRecord: record,
    });
    expect(result.error).toEqual(ANACHRONISM);
    expect(result.success).toBeUndefined();

    const after = scheduledMatchUps(record).map((matchUp: any) => [matchUp.matchUpId, timeOf(matchUp)]);
    expect(after).toEqual(before);
  });

  it('an invalid operational profile is refused before the schedule is shifted', () => {
    const { tournamentRecord }: any = generate();
    const before = scheduledMatchUps(tournamentRecord).map(timeOf);

    const result: any = applyScenarioProfile({
      scenarioProfile: { anchor: `${day}T14:00`, minutesBeforeAnchor: 60, called: { withinMinutes: -1 } },
      tournamentRecord,
    });
    expect(result.error).toBeDefined();
    expect(scheduledMatchUps(tournamentRecord).map(timeOf)).toEqual(before);
  });
});

import { scheduleGovernor } from '@Assemblies/governors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { SCHEDULED_TIME } from '@Constants/timeItemConstants';

/**
 * `clearMatchUpSchedule` takes a `tournamentRecord` OR a `drawDefinition`: given a drawDefinition it
 * finds the matchUp there. Called with only a drawDefinition it cleared the schedule and then threw
 * reading `tournamentRecord.tournamentId` for the modify notice.
 */
it('clears a matchUp schedule given only its drawDefinition', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });
  const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
  const { matchUpId } = tournamentEngine.allTournamentMatchUps().matchUps[0];

  const scheduled: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: tournamentRecord.startDate, scheduledTime: '10:00' },
    matchUpId,
    drawId,
  });
  expect(scheduled.success).toEqual(true);

  const drawDefinition = tournamentEngine.getTournament().tournamentRecord.events[0].drawDefinitions[0];
  const matchUpIn = () => drawDefinition.structures[0].matchUps.find((m: any) => m.matchUpId === matchUpId);
  const scheduledTimeOf = (matchUp: any) =>
    matchUp.schedule?.scheduledTime ??
    matchUp.timeItems?.find((item: any) => item.itemType === SCHEDULED_TIME)?.itemValue;

  // CONTROL: the matchUp really is scheduled before the clear
  expect(scheduledTimeOf(matchUpIn())).toBeDefined();

  const result: any = scheduleGovernor.clearMatchUpSchedule({ drawDefinition, matchUpId });
  expect(result.success).toEqual(true);
  expect(scheduledTimeOf(matchUpIn())).toBeUndefined();
});

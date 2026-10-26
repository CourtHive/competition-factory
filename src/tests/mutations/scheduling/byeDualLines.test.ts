import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { BYE } from '@Constants/matchUpStatusConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM } from '@Constants/matchUpTypes';

/**
 * The lines of a TEAM dual that is a BYE are stored TO_BE_PLAYED (the dual carries the BYE), and hydrate with a BYE
 * side: they will never be played. No scheduler places them; the lines of the duals that are played are placed.
 */
function teamDrawWithByes() {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6, eventType: TEAM_EVENT }],
    venueProfiles: [{ courtsCount: 20 }],
    setState: true,
  });
  const matchUps = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps;
  const firstRoundDuals = matchUps.filter((m: any) => m.matchUpType === TEAM && m.roundNumber === 1);
  const byeDualIds = new Set(firstRoundDuals.filter((m: any) => m.matchUpStatus === BYE).map((m: any) => m.matchUpId));
  const lines = matchUps.filter((m: any) => firstRoundDuals.some((dual: any) => dual.matchUpId === m.matchUpTieId));
  const byeLines = lines.filter((m: any) => byeDualIds.has(m.matchUpTieId)).map((m: any) => m.matchUpId);
  const playedLines = lines.filter((m: any) => !byeDualIds.has(m.matchUpTieId)).map((m: any) => m.matchUpId);
  // CONTROL: two BYE duals, their lines stored TO_BE_PLAYED, and two duals that are played
  expect(byeDualIds.size).toEqual(2);
  expect(byeLines.length).toBeGreaterThan(0);
  expect(playedLines.length).toBeGreaterThan(0);
  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  const round = {
    structureId: drawDefinition.structures[0].structureId,
    tournamentId: tournamentRecord.tournamentId,
    eventId: event.eventId,
    roundNumber: 1,
    drawId,
  };
  const scheduleDate = tournamentRecord.startDate;
  const venueId = tournamentRecord.venues[0].venueId;
  return { byeLines, playedLines, round, scheduleDate, venueId };
}

const placedOf = (scheduledMatchUpIds: any) =>
  new Set(Array.isArray(scheduledMatchUpIds) ? scheduledMatchUpIds : Object.values(scheduledMatchUpIds ?? {}).flat());

describe('no scheduler places the lines of a BYE dual', () => {
  it('the profile scheduler', () => {
    const { byeLines, playedLines, round, scheduleDate, venueId } = teamDrawWithByes();
    tournamentEngine.addSchedulingProfileRound({ round, scheduleDate, venueId });
    const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [scheduleDate] });
    const placed = placedOf(result.scheduledMatchUpIds);
    expect(byeLines.filter((id) => placed.has(id))).toEqual([]);
    expect(playedLines.every((id) => placed.has(id))).toEqual(true);
  });

  it('scheduleMatchUps', () => {
    const { byeLines, playedLines, scheduleDate, venueId } = teamDrawWithByes();
    const result: any = tournamentEngine.scheduleMatchUps({
      matchUpIds: [...byeLines, ...playedLines],
      venueIds: [venueId],
      scheduleDate,
    });
    const placed = placedOf(result.scheduledMatchUpIds);
    expect(byeLines.filter((id) => placed.has(id))).toEqual([]);
    expect(playedLines.every((id) => placed.has(id))).toEqual(true);
  });

  it('the grid', () => {
    const { byeLines, playedLines, round, scheduleDate, venueId } = teamDrawWithByes();
    tournamentEngine.addSchedulingProfileRound({ round, scheduleDate, venueId });
    const result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [scheduleDate] });
    const placed = placedOf(result.scheduledMatchUpIds);
    expect(byeLines.filter((id) => placed.has(id))).toEqual([]);
    expect(playedLines.some((id) => placed.has(id))).toEqual(true);
  });
});

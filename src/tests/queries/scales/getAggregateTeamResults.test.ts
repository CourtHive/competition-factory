import { completeDrawMatchUps } from '@Mutate/simulation/completeDrawMatchUps';
import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { defined } from '@Tests/helpers/defined';
import { expect, it } from 'vitest';

// Constants
import { USTA_GOLD_TEAM_CHALLENGE } from '@Constants/tieFormatConstants';
import { SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { isNumeric } from '@Tools/math';

it('can aggregate team scores across SINGLES/DOUBLES events', () => {
  const drawSize = 8;
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 }, // required to force generation of tieFormat-specific participants
    drawProfiles: [
      { generate: false, addEvent: false, eventType: TEAM_EVENT, drawSize, tieFormatName: USTA_GOLD_TEAM_CHALLENGE },
    ],
    setState: true,
  });

  const events = defined(tournamentEngine.getEvents().events, 'events');
  expect(events.length).toBe(0);

  const entryStatus = DIRECT_ACCEPTANCE;
  const result = tournamentEngine.generateEventsFromTieFormat({
    tieFormatName: USTA_GOLD_TEAM_CHALLENGE,
    addEntriesFromTeams: true,
    addEvents: true,
    entryStatus,
  });
  expect(result.success).toBe(true);

  for (const event of result.events) {
    const { eventId, eventType } = event;
    if (eventType === SINGLES_EVENT) {
      const result = tournamentEngine.generateDrawDefinition({
        // a tiebreak at time: an elimination draw refuses a format that can end level (spec § 9.7)
        matchUpFormat: 'SET1-S:T20/TB7',
        eventId,
      });
      expect(result.success).toBe(true);
      const { drawDefinition } = result;
      const completionResult = completeDrawMatchUps({ drawDefinition });
      expect(completionResult.success).toEqual(true);
      const addResult = tournamentEngine.addDrawDefinition({
        drawDefinition,
        eventId,
      });
      expect(addResult.success).toEqual(true);
    }
  }

  const pointsResult = tournamentEngine.getAggregateTeamResults();
  expect(pointsResult.success).toBe(true);

  const teamResults = defined('teamResults' in pointsResult ? pointsResult.teamResults : undefined, 'teamResults');
  for (const teamResult of Object.values(teamResults)) {
    const { points, diff, win, loss } = teamResult as { points: number; diff: number; win: number; loss: number };
    expect(points).toBeGreaterThanOrEqual(0);
    expect(loss).toBeGreaterThanOrEqual(0);
    expect(win).toBeGreaterThanOrEqual(0);
    expect(win + loss).toBeGreaterThan(0);
    expect(isNumeric(diff)).toBe(true);
  }
});

// Only timed formats are tallied. A two-sided matchUp whose format is absent, or does not parse,
// is not one of them — it is skipped, not a reason to throw.
it.each([
  ['no', undefined],
  ['an unparsable', 'NOT-A-FORMAT'],
])('skips a two-sided matchUp with %s matchUpFormat', (_label, matchUpFormat) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });
  const event = tournamentRecord.events[0];
  delete event.matchUpFormat;
  for (const drawDefinition of event.drawDefinitions) {
    delete drawDefinition.matchUpFormat;
    for (const structure of drawDefinition.structures) {
      delete structure.matchUpFormat;
      for (const matchUp of structure.matchUps) {
        if (matchUpFormat) matchUp.matchUpFormat = matchUpFormat;
        else delete matchUp.matchUpFormat;
      }
    }
  }
  tournamentEngine.setState(tournamentRecord);

  const { matchUps = [] } = tournamentEngine.allTournamentMatchUps();
  const twoSided = matchUps.filter((matchUp) => matchUp.sides?.length === 2);
  expect(twoSided.length).toBeGreaterThan(0);
  expect(twoSided.every((matchUp) => matchUp.matchUpFormat === matchUpFormat)).toEqual(true);

  const result: any = tournamentEngine.getAggregateTeamResults();
  expect(result.success).toEqual(true);
  expect(result.teamResults).toEqual({});
  expect(result.individualResults).toEqual({});
});

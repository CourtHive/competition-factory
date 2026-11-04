import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { FORMAT_FAST4, FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { NO_MODIFICATIONS_APPLIED } from '@Constants/errorConditionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

const startDate = '2026-11-02';
const nextDate = '2026-11-03';

afterEach(() => setSubscriptions({ subscriptions: {} }));

function setup(parentFormat = FORMAT_STANDARD) {
  const { tournamentRecord, drawIds, eventIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        matchUpFormat: FORMAT_STANDARD,
        outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString: '6-2 6-2', winningSide: 1 }],
      },
      { drawSize: 8, matchUpFormat: FORMAT_STANDARD },
    ],
    endDate: nextDate,
    startDate,
    nonRandom: 1,
    setState: true,
  });
  for (const event of tournamentRecord.events) {
    for (const draw of event.drawDefinitions) {
      draw.matchUpFormat = parentFormat;
      for (const structure of draw.structures) {
        for (const matchUp of structure.matchUps) {
          matchUp.matchUpFormat = FORMAT_STANDARD;
          matchUp.schedule = { scheduledDate: nextDate };
        }
      }
    }
  }
  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];
  const eventId = eventIds[0];
  const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;
  return { drawId, drawIds, eventId, structureId };
}

function rawMatchUps(drawId: string) {
  return tournamentEngine.allDrawMatchUps({ drawId, inContext: false }).matchUps;
}

it.each(['draw', 'structure', 'event', 'tournament'])('force clears unplayed overrides at %s scope', (scope) => {
  const { drawId, drawIds, eventId, structureId } = setup();
  const before = structuredClone(rawMatchUps(drawId));
  const otherBefore = structuredClone(rawMatchUps(drawIds[1]));
  const unplayed = before.filter((matchUp) => matchUp.matchUpStatus === TO_BE_PLAYED);
  expect(unplayed).toHaveLength(6);
  const expectedIds = new Set(unplayed.map((matchUp) => matchUp.matchUpId));
  if (scope === 'tournament') {
    for (const matchUp of otherBefore) expectedIds.add(matchUp.matchUpId);
  }
  const notices: any[] = [];
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payloads) => notices.push(...payloads) } });
  const selectors = { structure: { drawId, structureId }, draw: { drawId }, event: { eventId }, tournament: {} };
  const selector = selectors[scope];
  let result: any = tournamentEngine.setMatchUpFormat({ ...selector, matchUpFormat: FORMAT_FAST4, force: true });
  expect(result.success).toBe(true);
  expect(result.modificationsCount).toBeGreaterThanOrEqual(expectedIds.size);
  for (const matchUp of rawMatchUps(drawId)) {
    expect(matchUp.matchUpFormat).toEqual(expectedIds.has(matchUp.matchUpId) ? undefined : FORMAT_STANDARD);
    if (expectedIds.has(matchUp.matchUpId)) {
      result = tournamentEngine.getMatchUpFormat({ drawId, matchUpId: matchUp.matchUpId });
      expect(result.matchUpFormat).toEqual(FORMAT_FAST4);
    } else {
      expect(matchUp).toEqual(before.find((previous) => previous.matchUpId === matchUp.matchUpId));
    }
  }
  expect(new Set(notices.map(({ matchUp }) => matchUp.matchUpId))).toEqual(expectedIds);
  expect(notices).toHaveLength(expectedIds.size);
  for (const notice of notices) {
    const owner = tournamentEngine.getEvent({ drawId: notice.drawId }).event;
    expect(notice.eventId).toEqual(owner.eventId);
  }
  if (scope !== 'tournament') expect(rawMatchUps(drawIds[1])).toEqual(otherBefore);
});

it('keeps explicit matchUp formats without force', () => {
  const { drawId } = setup();
  let result: any = tournamentEngine.setMatchUpFormat({ drawId, matchUpFormat: FORMAT_FAST4 });
  expect(result.success).toBe(true);
  expect(rawMatchUps(drawId).every((matchUp) => matchUp.matchUpFormat === FORMAT_STANDARD)).toBe(true);
});

it.each([false, true])('a supplied date filter takes precedence over force=%s', (force) => {
  const { drawId } = setup();
  const target = rawMatchUps(drawId).find((matchUp) => matchUp.matchUpStatus === TO_BE_PLAYED);
  let result: any = tournamentEngine.addMatchUpScheduledDate({
    drawId,
    matchUpId: target.matchUpId,
    scheduledDate: startDate,
  });
  expect(result.success).toBe(true);
  const notices: any[] = [];
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payloads) => notices.push(...payloads) } });
  result = tournamentEngine.setMatchUpFormat({
    drawId,
    matchUpFormat: FORMAT_FAST4,
    scheduledDates: [startDate],
    force,
  });
  expect(result.success).toBe(true);
  for (const matchUp of rawMatchUps(drawId)) {
    expect(matchUp.matchUpFormat).toEqual(matchUp.matchUpId === target.matchUpId ? FORMAT_FAST4 : FORMAT_STANDARD);
  }
  expect(notices).toHaveLength(1);
  expect(notices[0].matchUp.matchUpId).toEqual(target.matchUpId);
});

it('does not clear overrides when an empty date filter is explicitly supplied', () => {
  const { drawId } = setup();
  const notices: any[] = [];
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payloads) => notices.push(...payloads) } });
  let result: any = tournamentEngine.setMatchUpFormat({
    drawId,
    matchUpFormat: FORMAT_FAST4,
    scheduledDates: [],
    force: true,
  });
  expect(result.success).toBe(true);
  expect(rawMatchUps(drawId).every((matchUp) => matchUp.matchUpFormat === FORMAT_STANDARD)).toBe(true);
  expect(notices).toHaveLength(0);
});

it('counts override removal even when the inherited format already matches, and emits no matchUp notice on repeat', () => {
  const { drawId } = setup(FORMAT_FAST4);
  const notices: any[] = [];
  setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (payloads) => notices.push(...payloads) } });
  let result: any = tournamentEngine.setMatchUpFormat({ drawId, matchUpFormat: FORMAT_FAST4, force: true });
  expect(result.modificationsCount).toBe(6);
  expect(notices).toHaveLength(6);
  notices.length = 0;
  result = tournamentEngine.setMatchUpFormat({ drawId, matchUpFormat: FORMAT_FAST4, force: true });
  expect(result.success).toBe(true);
  expect(result.info).toEqual(NO_MODIFICATIONS_APPLIED);
  expect(notices).toHaveLength(0);
});

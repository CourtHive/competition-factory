import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getMatchUpLocationIndex, locateMatchUp } from '@Acquire/locateMatchUp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMatchUpContext } from '@Query/matchUps/addMatchUpContext';
import { findMatchUp } from '@Acquire/findMatchUp';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { findEvent } from '@Acquire/findEvent';

// constants
import { DRAW_DEFINITION_NOT_FOUND, MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  AD_HOC,
  COMPASS,
  CURTIS_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

// every call is counted, and every call still does exactly what it did
vi.mock('@Query/matchUps/getAllTournamentMatchUps', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, allTournamentMatchUps: vi.fn(actual.allTournamentMatchUps) };
});
vi.mock('@Query/matchUps/addMatchUpContext', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, addMatchUpContext: vi.fn(actual.addMatchUpContext) };
});

const tournamentWalks = vi.mocked(allTournamentMatchUps);
const hydrations = vi.mocked(addMatchUpContext);

const DRAW_PROFILES = [
  { drawSize: 32, drawType: SINGLE_ELIMINATION },
  { drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION },
  { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
  { drawSize: 16, drawType: CURTIS_CONSOLATION },
  { drawSize: 16, drawType: COMPASS },
  { drawSize: 16, drawType: ROUND_ROBIN },
  { drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF },
  { drawSize: 8, drawType: AD_HOC, roundsCount: 2 },
  { drawSize: 8, eventType: TEAM, tieFormatName: DOMINANT_DUO },
  { drawSize: 8, drawType: ROUND_ROBIN, eventType: TEAM, tieFormatName: DOMINANT_DUO },
];

function generate(nonRandom: number, completeAllMatchUps = false) {
  return mocksEngine.generateTournamentRecord({ drawProfiles: DRAW_PROFILES, completeAllMatchUps, nonRandom })
    .tournamentRecord;
}

/**
 * What a bare-id lookup returned before the index: the event and draw read off the hydrated matchUp, then the
 * same draw-level lookup. Passing those ids explicitly takes the draw-level path with nothing else changed.
 */
function hydratedOracle(tournamentRecord, matchUpId, extra = {}, hydrated = hydratedIds(tournamentRecord)) {
  const ids = hydrated.get(matchUpId);
  if (!ids) return { error: MATCHUP_NOT_FOUND };
  const { eventId, drawId } = ids;
  const { event, drawDefinition } = findEvent({ tournamentRecord, eventId, drawId });
  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
  return findMatchUp({ tournamentRecord, matchUpId, drawDefinition, event, eventId, drawId, ...extra });
}

/** the event and draw the hydrated walk reports for each matchUp: the first one found, as `.find` took it */
function hydratedIds(tournamentRecord) {
  const ids = new Map<string, { eventId?: string; drawId?: string }>();
  for (const { matchUpId, eventId, drawId } of allTournamentMatchUps({ tournamentRecord }).matchUps ?? []) {
    if (!ids.has(matchUpId)) ids.set(matchUpId, { eventId, drawId });
  }
  return ids;
}

describe('locateMatchUp: a bare matchUpId resolves without hydrating the tournament', () => {
  beforeEach(() => {
    tournamentWalks.mockClear();
    hydrations.mockClear();
  });
  afterEach(() => {
    tournamentWalks.mockClear();
    hydrations.mockClear();
  });

  it.each([
    [11, false],
    [12, true],
  ])(
    'places every stored matchUp where hydration places it (seed %s, completed %s)',
    (seed, completed) => {
      const tournamentRecord = generate(seed, completed);
      const matchUps = allTournamentMatchUps({ tournamentRecord }).matchUps ?? [];
      const { locations, duplicated, selfNamed } = getMatchUpLocationIndex({ tournamentRecord });

      expect(duplicated.size).toEqual(0);
      expect(selfNamed.size).toEqual(0);
      expect(locations.size).toEqual(matchUps.length);
      for (const matchUp of matchUps) {
        const location = locations.get(matchUp.matchUpId);
        expect(location).toMatchObject({ eventId: matchUp.eventId, drawId: matchUp.drawId });
        // the draw-level structure agrees; a dual's lines in a group are reported by hydration at the container
        const top = (m) => m?.containerStructureId ?? m?.structureId;
        expect(top(location)).toEqual(top(matchUp));
        if (matchUp.containerStructureId) expect(location?.structureId).toEqual(matchUp.structureId);
      }
    },
    180_000,
  );

  it.each([
    [21, false],
    [22, true],
  ])(
    'findMatchUp by bare id returns what the hydrated walk returned (seed %s, completed %s)',
    (seed, completed) => {
      const tournamentRecord = generate(seed, completed);
      const hydrated = hydratedIds(tournamentRecord);
      expect(hydrated.size).toBeGreaterThan(300);

      let index = 0;
      for (const matchUpId of hydrated.keys()) {
        let result: any = findMatchUp({ tournamentRecord, matchUpId, inContext: true });
        expect(result.error).toBeUndefined();
        expect(result).toEqual(hydratedOracle(tournamentRecord, matchUpId, { inContext: true }, hydrated));

        // nextMatchUps hydrates the whole draw on either path; a sample keeps the test inside its budget
        if (index++ % 10 === 0) {
          const extra = { nextMatchUps: true, inContext: true };
          result = findMatchUp({ tournamentRecord, matchUpId, ...extra });
          expect(result).toEqual(hydratedOracle(tournamentRecord, matchUpId, extra, hydrated));
        }
        hydrations.mockClear();
        tournamentWalks.mockClear();
      }
    },
    180_000,
  );

  it('hydrates only the hit: a bare-id lookup never walks the tournament', () => {
    const tournamentRecord = generate(31);
    const matchUps = allTournamentMatchUps({ tournamentRecord }).matchUps ?? [];
    const dual = matchUps.find((m) => m.matchUpType === TEAM && m.tieMatchUps?.length);
    const single = matchUps.find((m) => !m.collectionId && m.matchUpType !== TEAM);
    expect(dual && single).toBeTruthy();

    for (const matchUpId of [single?.matchUpId, dual?.matchUpId, dual?.tieMatchUps?.[0].matchUpId]) {
      tournamentWalks.mockClear();
      hydrations.mockClear();
      const result: any = findMatchUp({ tournamentRecord, matchUpId: matchUpId as string, inContext: true });
      expect(result.matchUp.matchUpId).toEqual(matchUpId);
      expect(tournamentWalks).not.toHaveBeenCalled();
      // the hit itself, plus a dual's own lines: before the index this was every matchUp in the tournament
      expect(hydrations.mock.calls.length).toBeLessThanOrEqual(1 + (dual?.tieMatchUps?.length ?? 0));
    }

    tournamentWalks.mockClear();
    hydrations.mockClear();
    expect(findMatchUp({ tournamentRecord, matchUpId: 'no-such-matchUp' }).error).toEqual(MATCHUP_NOT_FOUND);
    expect(tournamentWalks).not.toHaveBeenCalled();
    expect(hydrations).not.toHaveBeenCalled();
  });

  it('matchUpActions by bare id answers as it does with the drawId, without walking the tournament', () => {
    const tournamentRecord = generate(41);
    tournamentEngine.setState(tournamentRecord);
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    for (const matchUp of [matchUps[0], matchUps[Math.floor(matchUps.length / 2)], matchUps.at(-1)]) {
      tournamentWalks.mockClear();
      const result: any = tournamentEngine.matchUpActions({ matchUpId: matchUp.matchUpId });
      expect(tournamentWalks).not.toHaveBeenCalled();
      expect(result).toEqual(tournamentEngine.matchUpActions({ matchUpId: matchUp.matchUpId, drawId: matchUp.drawId }));
    }
  });

  it('an index built for one call sees a matchUp a later mutation adds', () => {
    const tournamentRecord = generate(51);
    const before = getMatchUpLocationIndex({ tournamentRecord }).locations.size;
    const event = tournamentRecord.events[0];
    const structure = event.drawDefinitions[0].structures[0];
    structure.matchUps.push({ ...makeDeepCopy(structure.matchUps[0]), matchUpId: 'added-later' });
    expect(getMatchUpLocationIndex({ tournamentRecord }).locations.size).toEqual(before + 1);
    expect(locateMatchUp({ tournamentRecord, matchUpId: 'added-later' }).location?.drawId).toEqual(
      event.drawDefinitions[0].drawId,
    );
  });

  describe('where hydration could answer differently, hydration answers', () => {
    it('a duplicated id takes the hydrated walk and finds what it found', () => {
      const tournamentRecord = generate(61);
      const [first, second] = tournamentRecord.events.slice(0, 2).map((e) => e.drawDefinitions[0].structures[0]);
      const duplicate = { ...makeDeepCopy(second.matchUps[0]), matchUpId: first.matchUps[0].matchUpId };
      second.matchUps.unshift(duplicate);

      const { matchUpId } = duplicate;
      expect(locateMatchUp({ tournamentRecord, matchUpId }).exact).toEqual(false);
      tournamentWalks.mockClear();
      const result: any = findMatchUp({ tournamentRecord, matchUpId });
      expect(tournamentWalks).toHaveBeenCalledTimes(1);
      expect(result).toEqual(hydratedOracle(tournamentRecord, matchUpId));
    });

    it('a matchUp that names its own draw takes the hydrated walk', () => {
      const tournamentRecord = generate(62);
      const [first, second] = tournamentRecord.events.slice(0, 2);
      const matchUp = first.drawDefinitions[0].structures[0].matchUps[0];
      matchUp.drawId = second.drawDefinitions[0].drawId;

      expect(locateMatchUp({ tournamentRecord, matchUpId: matchUp.matchUpId }).exact).toEqual(false);
      const result: any = findMatchUp({ tournamentRecord, matchUpId: matchUp.matchUpId });
      expect(result).toEqual(hydratedOracle(tournamentRecord, matchUp.matchUpId));
    });

    it('a tieMatchUp whose dual names its own event takes the hydrated walk', () => {
      const tournamentRecord = generate(63);
      const index = getMatchUpLocationIndex({ tournamentRecord });
      const teamEvent = tournamentRecord.events.find((e) => e.eventType === TEAM);
      const dual = teamEvent.drawDefinitions[0].structures[0].matchUps[0];
      dual.eventId = teamEvent.eventId;
      const tieMatchUpId = dual.tieMatchUps[0].matchUpId;

      expect(index.selfNamed.has(tieMatchUpId)).toEqual(false);
      expect(getMatchUpLocationIndex({ tournamentRecord }).selfNamed.has(tieMatchUpId)).toEqual(true);
      expect(findMatchUp({ tournamentRecord, matchUpId: tieMatchUpId })).toEqual(
        hydratedOracle(tournamentRecord, tieMatchUpId),
      );
    });

    it("a tournament's standalone matchUp takes the hydrated walk and finds no draw", () => {
      const tournamentRecord = generate(64);
      tournamentRecord.matchUps = [{ matchUpId: 'standalone' }];

      expect(locateMatchUp({ tournamentRecord, matchUpId: 'standalone' })).toEqual({ exact: false });
      expect(findMatchUp({ tournamentRecord, matchUpId: 'standalone' }).error).toEqual(DRAW_DEFINITION_NOT_FOUND);
      expect(locateMatchUp({ tournamentRecord, matchUpId: 'absent' })).toEqual({ exact: true });
    });
  });
});

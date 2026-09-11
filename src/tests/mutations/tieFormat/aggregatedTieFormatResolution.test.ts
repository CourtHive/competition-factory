import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

/**
 * Regression: mutations must keep working after `aggregateTieFormats()`.
 *
 * Aggregation is the whole point of centralized tieFormats — it replaces each
 * object's inline `tieFormat` with a `tieFormatId` reference into
 * `event.tieFormats[]`. That flips which branch of `getItemTieFormat` runs:
 *
 *   inline `tieFormat`  → early return, `event` is never touched
 *   `tieFormatId`       → resolution against `drawDefinition` / `event`
 *
 * The second branch dereferences `drawDefinition.tieFormat` and `event.tieFormat`
 * WITHOUT guards, while `resolveTieFormat` declares both as optional. Any caller
 * that reaches hydration without threading `event` therefore crashes — but only
 * once a tournament has been aggregated, which is why this went unnoticed.
 *
 * `ensureSideLineUps` was such a caller: it accepted `eventId` but not `event`,
 * and called `findDrawMatchUp` without it. `updateTieMatchUpScore` is the path
 * that reaches it without a pre-resolved `inContextDualMatchUp`, so scoring a
 * tie matchUp in an aggregated tournament threw
 * `Cannot read properties of undefined (reading 'tieFormat')`.
 */

function aggregatedTeamTournament() {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);

  const aggregated: any = tournamentEngine.aggregateTieFormats();
  expect(aggregated.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });

  // Precondition: aggregation actually centralized the formats. Without this the
  // test could pass by never exercising the tieFormatId branch at all.
  expect(event.tieFormats?.length).toBeGreaterThan(0);

  return { event, eventId, drawId: event.drawDefinitions[0].drawId };
}

describe('tieFormat resolution after aggregateTieFormats', () => {
  it('removeCollectionDefinition succeeds on an aggregated tournament', () => {
    const { event, eventId, drawId } = aggregatedTeamTournament();
    const collectionId = event.tieFormats[0].collectionDefinitions[0].collectionId;

    const result: any = tournamentEngine.removeCollectionDefinition({ drawId, eventId, collectionId });

    expect(result.error).toBeUndefined();
    expect(result.success).toEqual(true);
  });

  it('hydrated TEAM matchUps still RESOLVE their centralized tieFormat', () => {
    // Not just "no crash". Guarding the dereference alone would stop the throw
    // while silently resolving `tieFormat` to undefined — the matchUp context
    // would lose its format and downstream collection/lineUp logic would work
    // from nothing. This asserts the reference is actually followed, which is
    // what threading `event` buys and what a guard alone cannot.
    const { eventId } = aggregatedTeamTournament();

    const teamMatchUps = tournamentEngine
      .allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] } })
      .matchUps.filter((m: any) => m.eventId === eventId);

    expect(teamMatchUps.length).toBeGreaterThan(0);
    for (const matchUp of teamMatchUps) {
      expect(matchUp.tieFormat).toBeDefined();
      expect(matchUp.tieFormat.collectionDefinitions?.length).toBeGreaterThan(0);
    }
  });
});

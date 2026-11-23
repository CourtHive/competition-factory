import { setSubscriptions } from '@Global/state/globalState';
import schema from '@Global/schema/tournament.schema.json';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';

// constants
import { MATCHUP_NOT_FOUND, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';
import { SINGLES_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * A matchUp's recording, stream or stats page is a resource of the matchUp, and `onlineResources` is where CODES
 * puts resources on every other element (CA, 2026-10-14: recordings go in "each matchUp's onlineResources (as
 * they should)"). The ingest already writes them there (courthive-ingest b818f2a), so the shape below is the one
 * in use and must need no change.
 */
const matchVideo = {
  identifier: 'https://example.com/embed/recording/rec-1',
  provider: 'MatchTennisApp',
  resourceSubType: 'VIDEO',
  resourceType: 'URL',
  name: 'matchVideo',
};

afterEach(() => setSubscriptions({ subscriptions: {} }));

function singlesDraw() {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], nonRandom: 1, setState: true });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  return { drawId, matchUpId: matchUps[0].matchUpId };
}

const storedMatchUp = (matchUpId: string) =>
  tournamentEngine
    .getTournament()
    .tournamentRecord.events.flatMap((event) => event.drawDefinitions)
    .flatMap((drawDefinition) => drawDefinition.structures)
    .flatMap((structure) => structure.matchUps)
    .flatMap((matchUp) => [matchUp, ...(matchUp.tieMatchUps ?? [])])
    .find((matchUp) => matchUp.matchUpId === matchUpId);

describe('MatchUp.onlineResources', () => {
  it('is added to the matchUp itself, notified, and carried in context', () => {
    const { drawId, matchUpId } = singlesDraw();
    const modified: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (notices) => modified.push(...notices) } });

    const result = tournamentEngine.addOnlineResource({ drawId, matchUpId, onlineResource: matchVideo });
    expect(result.success).toEqual(true);
    expect(storedMatchUp(matchUpId).onlineResources).toEqual([matchVideo]);
    // nothing else gained it
    expect(tournamentEngine.getTournament().tournamentRecord.onlineResources).toBeUndefined();

    expect(modified.map(({ matchUp }) => matchUp.matchUpId)).toContain(matchUpId);
    const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true });
    expect(matchUp.onlineResources).toEqual([matchVideo]);
  });

  it('merges as on every other element: the same name or identifier replaces', () => {
    const { drawId, matchUpId } = singlesDraw();
    const liveVideo = { ...matchVideo, identifier: 'https://example.com/live/1', name: 'liveVideo' };
    tournamentEngine.addOnlineResource({ drawId, matchUpId, onlineResource: matchVideo });
    tournamentEngine.addOnlineResource({ drawId, matchUpId, onlineResource: liveVideo });
    const replaced = { ...matchVideo, identifier: 'https://example.com/embed/recording/rec-2' };
    tournamentEngine.addOnlineResource({ drawId, matchUpId, onlineResource: replaced });
    expect(storedMatchUp(matchUpId).onlineResources).toEqual([liveVideo, replaced]);
  });

  it('is removed by identifier, resourceType and resourceSubType', () => {
    const { drawId, matchUpId } = singlesDraw();
    tournamentEngine.addOnlineResource({ drawId, matchUpId, onlineResource: matchVideo });
    const modified: any[] = [];
    setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: (notices) => modified.push(...notices) } });
    const result = tournamentEngine.removeOnlineResource({ drawId, matchUpId, onlineResource: matchVideo });
    expect(result.success).toEqual(true);
    expect(storedMatchUp(matchUpId).onlineResources).toEqual([]);
    expect(modified.map(({ matchUp }) => matchUp.matchUpId)).toContain(matchUpId);
  });

  it('reaches a tieMatchUp', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT }],
      nonRandom: 1,
      setState: true,
    });
    const { matchUps } = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [SINGLES_MATCHUP] },
    });
    const matchUpId = matchUps[0].matchUpId;
    expect(tournamentEngine.addOnlineResource({ drawId, matchUpId, onlineResource: matchVideo }).success).toEqual(true);
    expect(storedMatchUp(matchUpId).onlineResources).toEqual([matchVideo]);
  });

  it('needs the draw, and a matchUp in it', () => {
    const { drawId, matchUpId } = singlesDraw();
    expect(tournamentEngine.addOnlineResource({ matchUpId, onlineResource: matchVideo }).error).toEqual(
      MISSING_DRAW_DEFINITION,
    );
    expect(tournamentEngine.addOnlineResource({ drawId, matchUpId: 'none', onlineResource: matchVideo }).error).toEqual(
      MATCHUP_NOT_FOUND,
    );
    expect(
      tournamentEngine.removeOnlineResource({ drawId, matchUpId: 'none', onlineResource: matchVideo }).error,
    ).toEqual(MATCHUP_NOT_FOUND);
  });

  it('validates against the closed schema, which still refuses anything undeclared', () => {
    const { drawId, matchUpId } = singlesDraw();
    tournamentEngine.addOnlineResource({ drawId, matchUpId, onlineResource: matchVideo });
    const validate = addFormats(new Ajv({ allowUnionTypes: true, strict: false })).compile({
      $ref: '#/definitions/MatchUp',
      definitions: schema.definitions,
    });
    const matchUp = structuredClone(storedMatchUp(matchUpId));
    expect(validate(matchUp), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...matchUp, unexpected: true })).toBe(false);
  });
});

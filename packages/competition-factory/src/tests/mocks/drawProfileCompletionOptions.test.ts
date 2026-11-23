import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { AD_HOC, ROUND_ROBIN, ROUND_ROBIN_WITH_PLAYOFF, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

/**
 * `completeAllMatchUps`, `randomWinningSide` and `matchUpStatusProfile` on an individual drawProfile.
 *
 * These were honoured only as generation-wide options; set on a drawProfile they were silently
 * ignored, and 26 tests asserted on draws that had completed nothing. A drawProfile value now applies
 * to that draw and takes precedence over the generation-wide value; a drawProfile that leaves the
 * option undefined inherits it.
 */

function drawMatchUps(drawId: string) {
  return tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId] } }).matchUps;
}

function unscored(drawId: string, matchUpType?: string) {
  return drawMatchUps(drawId).filter(
    (matchUp) => (!matchUpType || matchUp.matchUpType === matchUpType) && !matchUp.winningSide,
  );
}

describe('completeAllMatchUps on a drawProfile (drawProfiles)', () => {
  it('completes only the draw whose profile sets it', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawId: 'done', drawType: SINGLE_ELIMINATION, drawSize: 16, completeAllMatchUps: true },
        { drawId: 'open', drawType: SINGLE_ELIMINATION, drawSize: 16 },
      ],
      setState: true,
    });

    expect(drawMatchUps('done').length).toEqual(15);
    expect(unscored('done')).toEqual([]);
    expect(drawMatchUps('open').every((matchUp) => !matchUp.winningSide)).toEqual(true);
  });

  it('completes a ROUND_ROBIN draw', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'rr', drawType: ROUND_ROBIN, drawSize: 8, completeAllMatchUps: true }],
      setState: true,
    });

    expect(drawMatchUps('rr').length).toEqual(12);
    expect(unscored('rr')).toEqual([]);
  });

  it('completes the playoff of a ROUND_ROBIN_WITH_PLAYOFF draw', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'rrp', drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 8, completeAllMatchUps: true }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'rrp' });
    const playoffStructureIds = new Set(
      drawDefinition.structures
        .filter((structure) => !structure.structures) // the round robin container holds the groups
        .map((structure) => structure.structureId),
    );
    const playoffMatchUps = drawMatchUps('rrp').filter((matchUp) => playoffStructureIds.has(matchUp.structureId));
    expect(playoffMatchUps.length).toBeGreaterThan(0);
    expect(unscored('rrp')).toEqual([]);
  });

  it('completes every round of an iterative AD_HOC draw', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'adhoc', drawType: AD_HOC, drawSize: 8, roundsCount: 3, completeAllMatchUps: true }],
      setState: true,
    });

    const matchUps = drawMatchUps('adhoc');
    expect(new Set(matchUps.map((matchUp) => matchUp.roundNumber)).size).toEqual(3);
    expect(matchUps.length).toEqual(12);
    // round 1 is paired too: without `automated` it used to be generated empty and left unscored
    expect(
      matchUps.filter((matchUp) => matchUp.roundNumber === 1 && matchUp.sides?.every((side) => side.participantId)),
    ).toHaveLength(4);
    expect(unscored('adhoc')).toEqual([]);
  });

  it('completes every round of an iterative AD_HOC draw with the generation-wide option', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'adhocTop', drawType: AD_HOC, drawSize: 8, roundsCount: 3 }],
      completeAllMatchUps: true,
      setState: true,
    });

    expect(drawMatchUps('adhocTop').length).toEqual(12);
    expect(unscored('adhocTop')).toEqual([]);
  });

  it('leaves an iterative AD_HOC draw with `automated: false` unpaired', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId: 'manual',
          drawType: AD_HOC,
          drawSize: 8,
          roundsCount: 3,
          automated: false,
          completeAllMatchUps: true,
        },
      ],
      setState: true,
    });

    expect(drawMatchUps('manual').every((matchUp) => !matchUp.sides?.some((side) => side.participantId))).toEqual(true);
  });

  it('completes the TEAM matchUps of a TEAM draw', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'team', eventType: TEAM_EVENT, drawSize: 4, completeAllMatchUps: true }],
      setState: true,
    });

    expect(drawMatchUps('team').filter((matchUp) => matchUp.matchUpType === TEAM_MATCHUP).length).toEqual(3);
    expect(unscored('team', TEAM_MATCHUP)).toEqual([]);
  });

  it('lets a drawProfile opt out of the generation-wide value', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawId: 'inherits', drawSize: 8 },
        { drawId: 'optsOut', drawSize: 8, completeAllMatchUps: false },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    expect(unscored('inherits')).toEqual([]);
    expect(drawMatchUps('optsOut').every((matchUp) => !matchUp.winningSide)).toEqual(true);
  });

  it('leaves the generation-wide option unchanged', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawId: 'a', drawSize: 8 },
        { drawId: 'b', drawType: ROUND_ROBIN, drawSize: 8 },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    expect(unscored('a')).toEqual([]);
    expect(unscored('b')).toEqual([]);
    // without randomWinningSide every generated result is won by side 1
    expect(drawMatchUps('a').every((matchUp) => matchUp.winningSide === 1)).toEqual(true);
  });

  it('applies matchUpStatusProfile and randomWinningSide per draw', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          matchUpStatusProfile: { [WALKOVER]: 100 },
          completeAllMatchUps: true,
          drawId: 'walkovers',
          drawSize: 8,
        },
        { drawId: 'random', drawSize: 32, completeAllMatchUps: true, randomWinningSide: true },
        { drawId: 'plain', drawSize: 8, completeAllMatchUps: true },
      ],
      setState: true,
    });

    const walkovers = drawMatchUps('walkovers');
    expect(walkovers.length).toEqual(7);
    expect(walkovers.every((matchUp) => matchUp.matchUpStatus === WALKOVER)).toEqual(true);

    const winningSides = new Set(drawMatchUps('random').map((matchUp) => matchUp.winningSide));
    expect(winningSides).toEqual(new Set([1, 2]));

    const plain = drawMatchUps('plain');
    expect(plain.every((matchUp) => matchUp.matchUpStatus === COMPLETED && matchUp.winningSide === 1)).toEqual(true);
  });
});

describe('completeAllMatchUps on a flight drawProfile (eventProfiles)', () => {
  it('completes only the flight whose profile sets it', () => {
    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          drawProfiles: [
            { drawId: 'flight1', drawSize: 8, completeAllMatchUps: true },
            { drawId: 'flight2', drawSize: 8 },
          ],
        },
      ],
      setState: true,
    });

    expect(drawMatchUps('flight1').length).toEqual(7);
    expect(unscored('flight1')).toEqual([]);
    expect(drawMatchUps('flight2').every((matchUp) => !matchUp.winningSide)).toEqual(true);
  });

  it('completes a ROUND_ROBIN_WITH_PLAYOFF flight including its playoff', () => {
    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          drawProfiles: [{ drawId: 'rrp', drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 8, completeAllMatchUps: true }],
        },
      ],
      setState: true,
    });

    expect(drawMatchUps('rrp').length).toBeGreaterThan(12);
    expect(unscored('rrp')).toEqual([]);
  });

  it('lets a flight opt out of the generation-wide value', () => {
    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          drawProfiles: [
            { drawId: 'inherits', drawSize: 8 },
            { drawId: 'optsOut', drawSize: 8, completeAllMatchUps: false },
          ],
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    expect(unscored('inherits')).toEqual([]);
    expect(drawMatchUps('optsOut').every((matchUp) => !matchUp.winningSide)).toEqual(true);
  });
});

describe('completeAllMatchUps on a drawProfile (modifyTournamentRecord)', () => {
  it('completes the added draw and the added flight that set it', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = mocksEngine.modifyTournamentRecord({
      drawProfiles: [{ drawId: 'added', drawSize: 8, completeAllMatchUps: true }],
      eventProfiles: [
        {
          drawProfiles: [
            { drawId: 'flightDone', drawSize: 8, completeAllMatchUps: true },
            { drawId: 'flightOpen', drawSize: 8 },
          ],
        },
      ],
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    tournamentEngine.setState(tournamentRecord);

    expect(drawMatchUps('added').length).toEqual(7);
    expect(unscored('added')).toEqual([]);
    expect(drawMatchUps('flightDone').length).toEqual(7);
    expect(unscored('flightDone')).toEqual([]);
    expect(drawMatchUps('flightOpen').every((matchUp) => !matchUp.winningSide)).toEqual(true);
  });
});

/**
 * D5: `completeAllMatchUps`, `randomWinningSide` and `matchUpStatusProfile` on an eventProfile. The unknown-key
 * check accepted them, but a new event read only the generation-wide values, so an eventProfile that set them
 * completed nothing; only an existing event in `modifyTournamentRecord` honoured them. Precedence is now the same
 * everywhere: drawProfile, then eventProfile, then top-level.
 */
describe('completion options on an eventProfile', () => {
  it('generateTournamentRecord completes the draws of the event that sets it', () => {
    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        { drawProfiles: [{ drawId: 'done', drawSize: 8 }], completeAllMatchUps: true },
        { drawProfiles: [{ drawId: 'open', drawSize: 8 }] },
      ],
      setState: true,
    });

    expect(drawMatchUps('done').length).toEqual(7);
    expect(unscored('done')).toEqual([]);
    expect(drawMatchUps('open').every((matchUp) => !matchUp.winningSide)).toEqual(true);
  });

  it('applies the eventProfile matchUpStatusProfile and randomWinningSide', () => {
    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          drawProfiles: [{ drawId: 'walkovers', drawSize: 8 }],
          matchUpStatusProfile: { [WALKOVER]: 100 },
          completeAllMatchUps: true,
        },
        { drawProfiles: [{ drawId: 'random', drawSize: 32 }], completeAllMatchUps: true, randomWinningSide: true },
      ],
      setState: true,
    });

    expect(drawMatchUps('walkovers').every((matchUp) => matchUp.matchUpStatus === WALKOVER)).toEqual(true);
    const winningSides = new Set(drawMatchUps('random').map((matchUp) => matchUp.winningSide));
    expect(winningSides).toEqual(new Set([1, 2]));
  });

  it('a drawProfile overrides its eventProfile, and an eventProfile overrides the top level', () => {
    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          drawProfiles: [
            { drawId: 'inherits', drawSize: 8 },
            { drawId: 'drawOptsOut', drawSize: 8, completeAllMatchUps: false },
          ],
          completeAllMatchUps: true,
        },
        { drawProfiles: [{ drawId: 'eventOptsOut', drawSize: 8 }], completeAllMatchUps: false },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    expect(unscored('inherits')).toEqual([]);
    expect(drawMatchUps('drawOptsOut').every((matchUp) => !matchUp.winningSide)).toEqual(true);
    expect(drawMatchUps('eventOptsOut').every((matchUp) => !matchUp.winningSide)).toEqual(true);
  });

  it('modifyTournamentRecord completes a new event that sets it', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = mocksEngine.modifyTournamentRecord({
      eventProfiles: [
        { eventName: 'New', drawProfiles: [{ drawId: 'newEvent', drawSize: 8 }], completeAllMatchUps: true },
      ],
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    tournamentEngine.setState(tournamentRecord);

    expect(drawMatchUps('newEvent').length).toEqual(7);
    expect(unscored('newEvent')).toEqual([]);
  });
});

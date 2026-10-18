import { validateCollectionDefinition } from '@Validators/validateCollectionDefinition';
import { addPoint, createMatchUp, getScore } from '@Assemblies/governors/scoreGovernor';
import * as matchUpFormatCode from '@Assemblies/governors/matchUpFormatGovernor';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { UNRECOGNIZED_MATCHUP_FORMAT } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { SINGLES } from '@Constants/matchUpTypes';

/**
 * The scoring engine specification's decision 19 (CA 2026-10-18), the v1 changes it names:
 *
 * - § 4.2: a tiebreak below S − 1 (`@T` with T < S − 1) is refused at validation for a new format;
 * - § 9.3 rule 5: an aggregate of standard sets is refused at validation for a new format;
 * - § 12.8: a persisted format of either kind is still READ (parsed) and replays by v1's rule;
 * - § 3.5: in a timed set whose points build games, the games are of the declared game format, a
 *   consecutive-points one included.
 *
 * "Valid for new use" is `isValidMatchUpFormat` (the governor's `isValid`); "readable" is `parse`.
 * On `dev` before this change the two agreed and accepted both refused kinds, and a timed set built
 * traditional games whatever `-G:` said.
 */

const { isValid, parse } = matchUpFormatCode;

describe('§ 4.2: a tiebreak below S − 1 is refused for new use (CA 2026-10-18)', () => {
  it.each(['SET3-S:6/TB7@4', 'SET3-S:6/TB7@3', 'SET3-S:8/TB7@6', 'SET3-S:6/TB7-F:6/TB10@4', 'SET5-S:6NOAD/TB7@1'])(
    '%s is refused, and still parses for replay',
    (code) => {
      expect(isValid({ matchUpFormat: code })).toEqual(false);
      expect(parse(code)).toBeDefined();
    },
  );

  // T ≥ S − 1 is v1's rule as it stands: the early tiebreak at S − 1, the default at S, a late one
  it.each([
    'SET3-S:6/TB7@5',
    'SET3-S:4/TB5@3',
    'SET1-S:8/TB7@7',
    'SET3-S:6/TB7',
    'SET3-S:6/TB7-F:6/TB7@12',
    'SET3-S:1/TB7',
  ])('%s stays valid', (code) => {
    expect(isValid({ matchUpFormat: code })).toEqual(true);
  });
});

describe('§ 9.3 rule 5: an aggregate of standard sets is refused for new use (CA 2026-10-18: "refuse")', () => {
  it.each(['SET3A-S:6/TB7', 'QTR4A-S:6/TB7', 'INN5A-S:6', 'INN3XA-S:6/TB7', 'SET3A-S:T10-F:6/TB7'])(
    '%s is refused, and still parses for replay',
    (code) => {
      expect(isValid({ matchUpFormat: code })).toEqual(false);
      expect(parse(code)?.aggregate).toEqual(true);
    },
  );

  // aggregation is defined over timed and tiebreak-only segments; an exactly-N aggregate's -F: is the
  // decider, set N + 1, which is not summed (§ 9.4)
  it.each(['SET3XA-S:T10', 'SET3A-S:TB11', 'HAL2A-S:T45', 'QTR4A-S:T12', 'SET3XA-S:T10-F:TB1'])(
    '%s stays valid',
    (code) => {
      expect(isValid({ matchUpFormat: code })).toEqual(true);
    },
  );
});

describe('§ 12.8: a persisted refused format replays by v1’s rule', () => {
  it('SET3A-S:6/TB7 still scores point by point: 24 points to love are a 6-0 set', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3A-S:6/TB7' });
    for (let i = 0; i < 24; i++) matchUp = addPoint(matchUp, { winner: 0 });
    expect(matchUp.score.sets[0]).toMatchObject({ side1Score: 6, side2Score: 0, winningSide: 1 });
  });

  it('SET3-S:6/TB7@3 still scores by v1’s rule: at three games all the tiebreak decides', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7@3' });
    for (let game = 0; game < 6; game++) {
      for (let i = 0; i < 4; i++) matchUp = addPoint(matchUp, { winner: (game % 2) as 0 | 1 });
    }
    for (let i = 0; i < 7; i++) matchUp = addPoint(matchUp, { winner: 0 });
    expect(matchUp.score.sets[0]).toMatchObject({ side1Score: 4, side2Score: 3, winningSide: 1 });
  });

  // draw generation refuses a refused format too, so a stored one is written onto the record as v1 wrote it
  function storedFormatScenario(storedFormat?: string) {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN }],
    });
    if (storedFormat) tournamentRecord.events[0].drawDefinitions[0].matchUpFormat = storedFormat;
    tournamentEngine.setState(tournamentRecord);
    const matchUp = tournamentEngine.allTournamentMatchUps().matchUps[0];
    return { matchUpId: matchUp.matchUpId, drawId: matchUp.drawId, stored: matchUp.matchUpFormat };
  }

  it('draw generation refuses a refused format as a new format', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, matchUpFormat: 'SET3A-S:6/TB7' }],
    });
    expect(result.error?.code).toEqual(UNRECOGNIZED_MATCHUP_FORMAT.code);
  });

  it('setMatchUpFormat refuses a refused format as a new format', () => {
    const { matchUpId, drawId } = storedFormatScenario();
    let result: any = tournamentEngine.setMatchUpFormat({ matchUpFormat: 'SET3A-S:6/TB7', matchUpId, drawId });
    expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);
    result = tournamentEngine.setMatchUpFormat({ matchUpFormat: 'SET3-S:6/TB7@3', matchUpId, drawId });
    expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);
  });

  it('a score sent with the stored refused format is accepted; a change to one is refused', () => {
    const { matchUpId, drawId, stored } = storedFormatScenario('SET3-S:6/TB7@3');
    expect(stored).toEqual('SET3-S:6/TB7@3');
    const outcome = {
      score: { sets: [{ setNumber: 1, side1Score: 4, side2Score: 1, winningSide: 1 }] },
      matchUpStatus: 'IN_PROGRESS',
    };
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { ...outcome, matchUpFormat: stored },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setMatchUpStatus({ outcome, matchUpFormat: 'SET3-S:8/TB7@4', matchUpId, drawId });
    expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);
  });

  it('a collection is added only with a format valid for new use; a stored one stays readable', () => {
    const collectionDefinition: any = {
      collectionName: 'Singles',
      matchUpFormat: 'SET3A-S:6/TB7',
      matchUpType: SINGLES,
      collectionId: 'c1',
      matchUpCount: 1,
      matchUpValue: 1,
    };
    const stored = validateCollectionDefinition({ collectionDefinition, checkCategory: false, checkGender: false });
    expect(stored.valid).toEqual(true);
    const added = validateCollectionDefinition({
      collectionDefinition,
      checkCategory: false,
      checkGender: false,
      newUse: true,
    });
    expect(added.valid).not.toEqual(true);
  });
});

describe('§ 3.5: a timed set builds games of the declared game format (CA 2026-10-18)', () => {
  const FORMAT = 'SET3-S:T10-G:3C';
  const play = (winners: string) => {
    let matchUp = createMatchUp({ matchUpFormat: FORMAT });
    for (const w of winners) matchUp = addPoint(matchUp, { winner: (Number(w) - 1) as 0 | 1 });
    return matchUp;
  };

  it('three points in a row are a game', () => {
    const matchUp = play('111');
    expect(matchUp.score.sets[0]).toMatchObject({ side1Score: 1, side2Score: 0 });
    expect(getScore(matchUp).points).toEqual([0, 0]);
  });

  it('a point to the other side starts the run again; alternating points never finish a game', () => {
    expect(play('11211212').score.sets[0]).toMatchObject({ side1Score: 0, side2Score: 0 });
    expect(play('11222').score.sets[0]).toMatchObject({ side1Score: 0, side2Score: 1 });
  });

  it('two consecutive games: six points to love are 2-0, not one traditional game', () => {
    expect(play('111111').score.sets[0]).toMatchObject({ side1Score: 2, side2Score: 0 });
  });

  it('without -G: the timed set keeps traditional games', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:T10' });
    for (let i = 0; i < 3; i++) matchUp = addPoint(matchUp, { winner: 0 });
    expect(matchUp.score.sets[0]).toMatchObject({ side1Score: 0, side2Score: 0 });
  });
});

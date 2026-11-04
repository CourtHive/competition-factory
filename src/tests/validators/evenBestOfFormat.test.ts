import { isValidMatchUpFormat, isWellFormedMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { validateCollectionDefinition } from '@Validators/validateCollectionDefinition';
import * as matchUpFormatCode from '@Assemblies/governors/matchUpFormatGovernor';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it, vi } from 'vitest';

import { UNRECOGNIZED_MATCHUP_FORMAT } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';
import { SINGLES } from '@Constants/matchUpTypes';

const BAD_DECIDER = 'SET2-S:6/TB7-F:TB10';
const GOOD_DECIDER = 'SET3-S:6/TB7-F:TB10';

describe('an unmarked best-of count must be odd', () => {
  it.each([BAD_DECIDER, 'SET2-S:6/TB7', 'SET4-S:6', 'SET6-S:6/TB7', 'MAP2-S:TB11', 'HAL2-S:T45'])(
    'rejects %s for new use',
    (matchUpFormat) => {
      expect(isValidMatchUpFormat({ matchUpFormat })).toBe(false);
    },
  );

  it.each([
    GOOD_DECIDER,
    'SET1-S:6/TB7',
    'SET7-S:TB11',
    'SET2X-S:6/TB7',
    'SET4X-S:6',
    'SET6X-S:6/TB7',
    'SET2A-S:TB10',
    'SET2XA-S:T10',
    'HAL2A-S:T45',
    'QTR4A-S:T12',
  ])('preserves explicit exactly/aggregate and odd best-of formats: %s', (matchUpFormat) => {
    expect(isValidMatchUpFormat({ matchUpFormat })).toBe(true);
  });

  it('explains the invalid count and the intended deciding-third-set format', () => {
    const result = matchUpFormatCode.validateMatchUpFormat({ matchUpFormat: BAD_DECIDER });
    expect(result.valid).toBe(false);
    expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);
    expect(result.info).toContain('odd');
    expect(result.info).toContain('SET2X');
    expect(result.info).toContain(GOOD_DECIDER);
  });

  it('can decode an old stored value without approving or silently rewriting it', () => {
    expect(isWellFormedMatchUpFormat({ matchUpFormat: BAD_DECIDER })).toBe(true);
    const parsed = matchUpFormatCode.parse(BAD_DECIDER);
    expect(parsed?.bestOf).toBe(2);
    expect(matchUpFormatCode.stringify(parsed)).toBe(BAD_DECIDER);
    expect(isValidMatchUpFormat({ matchUpFormat: BAD_DECIDER })).toBe(false);
  });

  it('keeps existing aggregate-of-standard-sets restrictions', () => {
    expect(isValidMatchUpFormat({ matchUpFormat: 'SET2A-S:6/TB7' })).toBe(false);
  });

  it('rejects a format change with an explanation before records or notices change', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, matchUpFormat: GOOD_DECIDER }],
      nonRandom: 1,
      setState: true,
    });
    const matchUpId = tournamentEngine.allTournamentMatchUps().matchUps[0].matchUpId;
    const before = tournamentEngine.getState();
    const notify = vi.fn();
    setSubscriptions({ subscriptions: { [MODIFY_MATCHUP]: notify } });
    try {
      const result = tournamentEngine.setMatchUpFormat({ drawId, matchUpId, matchUpFormat: BAD_DECIDER });
      expect(result.error).toEqual(UNRECOGNIZED_MATCHUP_FORMAT);
      expect(result.info.message).toContain(GOOD_DECIDER);
      expect(tournamentEngine.getState()).toEqual(before);
      expect(notify).not.toHaveBeenCalled();
    } finally {
      setSubscriptions({ subscriptions: {} });
    }
  });

  it('explains the refusal when the format is assigned to a new collection', () => {
    const result = validateCollectionDefinition({
      collectionDefinition: {
        collectionId: 'singles',
        matchUpType: SINGLES,
        matchUpCount: 1,
        matchUpValue: 1,
        matchUpFormat: BAD_DECIDER,
      },
      newUse: true,
    });
    expect(result.error).toBeDefined();
    expect(result.errors?.join(' ')).toContain(GOOD_DECIDER);
  });
});

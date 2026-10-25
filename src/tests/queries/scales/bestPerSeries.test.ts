import { getTournamentPointAwards } from '@Query/scales/getTournamentPointAwards';
import { getParticipantPoints } from '@Query/scales/getParticipantPoints';
import { generateRankingList } from '@Query/scales/generateRankingList';
import type { AggregationRules } from '@Types/rankingTypes';
import { mocksEngine } from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import fs from 'fs-extra';
import Ajv from 'ajv';

// constants and fixtures
import { POLICY_RANKING_POINTS_BASIC } from '@Fixtures/policies/POLICY_RANKING_POINTS_BASIC';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';

/**
 * A tournament series is the same tournament across its editions (CODES Tournament.tournamentSeriesId, CA
 * 2026-10-25). The ITF Junior combined ranking counts only the best result from up to two editions of the same J100
 * or higher graded tournament (Reg. 10): CountingBucket.bestPerSeries.
 */

const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
ajv.addFormat('date-time', (dateTime: any) => !Number.isNaN(Date.parse(dateTime)));
addFormats(ajv);
const validate = ajv.compile(fs.readJsonSync('./src/global/schema/tournament.schema.json'));

function award(personId: string, level: number, points: number, tournamentSeriesId?: string, eventType = SINGLES) {
  return { personId, eventType, level, points, positionPoints: points, endDate: '2026-06-01', tournamentSeriesId };
}

const rules = (bestPerSeries?: { levels?: number[] }): AggregationRules => ({
  countingBuckets: [
    {
      bucketName: 'Singles',
      eventTypes: [SINGLES],
      bestOfCount: 6,
      pointComponents: ['positionPoints'],
      bestPerSeries,
    },
  ],
});

describe('Tournament.tournamentSeriesId', () => {
  it('validates against tournament.schema.json', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    const valid = validate({ ...tournamentRecord, tournamentSeriesId: 'J300-MEX' });
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('is stamped on every point award by getTournamentPointAwards, and absent when the record has none', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      completeAllMatchUps: true,
    });
    const policyDefinitions = POLICY_RANKING_POINTS_BASIC;

    const withSeries: any = getTournamentPointAwards({
      tournamentRecord: { ...tournamentRecord, tournamentSeriesId: 'J300-MEX' },
      policyDefinitions,
      level: 1,
    });
    expect(withSeries.pointAwards.length).toBeGreaterThan(0);
    expect(withSeries.pointAwards.every((a: any) => a.tournamentSeriesId === 'J300-MEX')).toBe(true);

    const without: any = getTournamentPointAwards({ tournamentRecord, policyDefinitions, level: 1 });
    expect(without.pointAwards.some((a: any) => 'tournamentSeriesId' in a)).toBe(false);
  });
});

describe('CountingBucket.bestPerSeries', () => {
  const asOfDate = '2026-07-01';

  // two editions of one J300 (level 5), a J500 (level 4) with no series, and two editions of one J60 (level 8)
  const pointAwards = [
    award('p1', 5, 300, 'J300-MEX'),
    award('p1', 5, 140, 'J300-MEX'),
    award('p1', 4, 250),
    award('p1', 8, 60, 'J60-ISR'),
    award('p1', 8, 36, 'J60-ISR'),
  ];

  it('counts the best edition of a series at the listed levels and drops the other', () => {
    const [entry] = generateRankingList({
      pointAwards,
      aggregationRules: rules({ levels: [1, 4, 5, 6, 7] }),
      asOfDate,
    });
    const [singles] = entry.bucketBreakdown ?? [];
    expect(singles.countingResults.map((a) => a.positionPoints)).toEqual([300, 250, 60, 36]);
    expect(singles.droppedResults.map((a) => a.positionPoints)).toEqual([140]);
    // the J60 editions both count: J60 is below J100
    expect(entry.totalPoints).toEqual(300 + 250 + 60 + 36);
  });

  it('applies at every level when levels is omitted', () => {
    const [entry] = generateRankingList({ pointAwards, aggregationRules: rules({}), asOfDate });
    expect(entry.totalPoints).toEqual(300 + 250 + 60);
  });

  it('changes nothing without the rule', () => {
    const [entry] = generateRankingList({ pointAwards, aggregationRules: rules(), asOfDate });
    expect(entry.totalPoints).toEqual(300 + 140 + 250 + 60 + 36);
  });

  it('frees the dropped edition’s slot for the next best result', () => {
    // seven results; without the rule the 140 edition takes the sixth slot, with it the 20 does
    const seven = [...pointAwards, award('p1', 6, 100), award('p1', 7, 20)];
    const [entry] = generateRankingList({
      pointAwards: seven,
      aggregationRules: rules({ levels: [1, 4, 5, 6, 7] }),
      asOfDate,
    });
    expect(entry.totalPoints).toEqual(300 + 250 + 100 + 60 + 36 + 20);
  });

  it('is applied per bucket: a doubles edition does not displace a singles one', () => {
    const mixed = [award('p1', 5, 300, 'J300-MEX'), award('p1', 5, 225, 'J300-MEX', DOUBLES)];
    const twoBuckets: AggregationRules = {
      countingBuckets: [
        { bucketName: 'Singles', eventTypes: [SINGLES], pointComponents: ['positionPoints'], bestPerSeries: {} },
        { bucketName: 'Doubles', eventTypes: [DOUBLES], pointComponents: ['positionPoints'], bestPerSeries: {} },
      ],
    };
    const { totalPoints } = getParticipantPoints({ pointAwards: mixed, personId: 'p1', aggregationRules: twoBuckets });
    expect(totalPoints).toEqual(525);
  });
});

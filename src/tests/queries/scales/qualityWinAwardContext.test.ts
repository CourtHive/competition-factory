import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { describe, expect, it } from 'vitest';
import { mocksEngine } from '../../..';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';

// A quality-win bonus used to be emitted as its own award carrying only
// { qualityWinPoints, qualityWins, pointsAuthority, eventType, drawId }. With no
// category, generateRankingList's age-category filter dropped it from every
// age-category list, and a consumer that stores awards (courthive-rankings:
// points and end_date NOT NULL) could not persist it. It now rides on the award
// for the same draw.

const rankingPoints = {
  awardProfiles: [
    {
      profileName: 'Standard Elimination',
      drawTypes: [SINGLE_ELIMINATION],
      finishingPositionRanges: { 1: 1000, 2: 700, 4: 400, 8: 200 },
    },
  ],
  qualityWinProfiles: [
    {
      rankingScaleName: 'TEST_RANKING',
      rankingSnapshot: 'latestAvailable',
      unrankedOpponentBehavior: 'noBonus',
      rankingRanges: [{ rankRange: [1, 8], value: 50 }],
    },
  ],
};

function rankedU16Tournament() {
  mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        eventType: SINGLES,
        gender: 'MALE',
        category: { ageCategoryCode: 'U16' },
        drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });
  const { participants } = tournamentEngine.getParticipants();
  participants.forEach((p: any, index: number) => {
    const scaleItem = { scaleName: 'TEST_RANKING', scaleType: RANKING, eventType: SINGLES, scaleValue: index + 1 };
    expect(tournamentEngine.setParticipantScaleItem({ participantId: p.participantId, scaleItem }).success).toEqual(
      true,
    );
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  return tournamentRecord;
}

describe('quality-win points ride on the award for their draw', () => {
  it('carries the draw category, dates and points on every award that has a quality win', () => {
    const tournamentRecord = rankedU16Tournament();

    let result: any = scaleEngine.getTournamentPointAwards({
      policyDefinitions: { [POLICY_TYPE_RANKING_POINTS]: rankingPoints },
      tournamentRecord,
    });
    expect(result.success).toEqual(true);

    const withQualityWins = result.pointAwards.filter((a: any) => a.qualityWinPoints);
    // The champion beat three ranked opponents; every winner of a match did too.
    expect(withQualityWins.length).toBeGreaterThan(0);
    for (const award of withQualityWins) {
      expect(award.category?.ageCategoryCode).toEqual('U16');
      expect(award.category?.gender).toEqual('MALE');
      expect(typeof award.points).toEqual('number');
      expect(award.endDate).toBeDefined();
      expect(award.qualityWins.length).toBeGreaterThan(0);
    }

    // One award per person per draw: the bonus is not a second award.
    const perPersonDraw = new Set(result.pointAwards.map((a: any) => `${a.personId}|${a.drawId}`));
    expect(perPersonDraw.size).toEqual(result.pointAwards.length);

    // `points` stays position + per-win + bonus; the quality win is a separate component.
    for (const award of result.pointAwards) {
      expect(award.points).toEqual(award.positionPoints + award.perWinPoints + award.bonusPoints);
    }
  });

  it('keeps the quality-win points on an age-category ranking list', () => {
    const tournamentRecord = rankedU16Tournament();
    const { pointAwards } = scaleEngine.getTournamentPointAwards({
      policyDefinitions: { [POLICY_TYPE_RANKING_POINTS]: rankingPoints },
      tournamentRecord,
    }) as any;
    const awarded = pointAwards.reduce((sum: number, a: any) => sum + (a.qualityWinPoints ?? 0), 0);
    expect(awarded).toBeGreaterThan(0);

    const entries: any = scaleEngine.generateRankingList({
      pointAwards,
      categoryFilter: { ageCategoryCodes: ['U16'], genders: ['MALE'] },
      aggregationRules: {
        countingBuckets: [
          { bucketName: 'Singles', pointComponents: ['positionPoints', 'perWinPoints', 'bonusPoints'] },
          { bucketName: 'Quality Wins', pointComponents: ['qualityWinPoints'] },
        ],
      },
    });

    const listed = entries.reduce((sum: number, e: any) => sum + (e.bucketTotals?.['Quality Wins'] ?? 0), 0);
    expect(listed).toEqual(awarded);
  });

  it('still emits an award, with its context, when the quality win is the only thing the draw earned', () => {
    const tournamentRecord = rankedU16Tournament();
    // Only the champion earns finishing-position points, so a quarterfinal
    // winner's award exists for its quality win alone.
    const championOnly = {
      ...rankingPoints,
      awardProfiles: [{ ...rankingPoints.awardProfiles[0], finishingPositionRanges: { 1: 1000 } }],
    };

    let result: any = scaleEngine.getTournamentPointAwards({
      policyDefinitions: { [POLICY_TYPE_RANKING_POINTS]: championOnly },
      tournamentRecord,
    });

    const bonusOnly = result.pointAwards.filter((a: any) => !a.points && a.qualityWinPoints);
    expect(bonusOnly.length).toBeGreaterThan(0);
    for (const award of bonusOnly) {
      expect(award).toMatchObject({ points: 0, positionPoints: 0, perWinPoints: 0, bonusPoints: 0 });
      expect(award.category?.ageCategoryCode).toEqual('U16');
      expect(award.endDate).toBeDefined();
    }
  });
});

import { POLICY_RANKING_POINTS_CTS } from '@Tests/fixtures/policies/POLICY_RANKING_POINTS_CTS';
import scaleEngine from '@Assemblies/engines/scale';
import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { describe, expect, test } from 'vitest';

import { SINGLES } from '@Constants/eventConstants';
import { MALE } from '@Constants/genderConstants';

// CTS Klasifikační řád 2025, Tabulka IV postscript (Article 21):
// "Points for victory in qualifying (for advancing to the main draw) are
//  obtained depending on the size of the starting field in the main draw.
//  E.g., if the main draw in the 14th category has 32 participants,
//  qualifying winners get 42 points, qualifying finalists 29 points,
//  qualifying semifinalists 20 points."
//
// Mapped onto POLICY_RANKING_POINTS_CTS.ts:
//   - Q WINNERS (advanced) → MAIN R1-equivalent points via Article 17 (the
//     MAIN awardProfile handles this naturally). NOT encoded as a Q award.
//   - Q FINALISTS (lost final-shy round) → MAIN R1 column +1 in Tabulka IV.
//   - Q SF / Q QF etc. → +2 / +3 / ... columns right.
//
// `resolvePositionPoints` in getTournamentPoints.ts:194-196 rewrites the
// awardProfile accessor for QUALIFYING participations:
//   accessor = participantWon ? 1 : 2^finishingRound
// So Q non-advancers' rangeKey == 2 (one round shy), 4 (two rounds shy), etc.

describe('CTS POLICY_RANKING_POINTS_CTS — Article 21 qualifying-stage points', () => {
  test('Q non-advancers receive Tabulka IV column-shifted points', () => {
    // 16-MAIN with 8-Q (4 qualifying-positions). Factory auto-generates
    // participants + completes all matchUps. The 4 Q-final losers (the
    // qualifier-feed round losers) should each receive points equal to the
    // Tabulka IV column at MAIN-R1-index+1, looked up at the requested level.
    //
    // For level 12, Tabulka IV row = [200, 138, 96, 67, 47, 33, 23, 16, 11, 7]:
    //   - 16-MAIN R1 = column 4 (rangeKey 16) = 47 pts
    //   - Q-final loser (column-one-right) = column 5 (rangeKey 32) = 33 pts
    //   - Q-SF loser (column-two-right)   = column 6 = 23 pts (but 8-Q is
    //     2-round so SF rangeKey 4 may not appear; encoded regardless).

    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      tournamentName: 'CTS Article 21 Test',
      participantsProfile: { participantsCount: 12, sex: MALE },
      tournamentAttributes: {
        tournamentTier: { system: 'CTS', value: 'A', numericRank: 12 },
      },
      drawProfiles: [
        {
          drawSize: 16,
          eventType: SINGLES,
          matchUpType: SINGLES,
          gender: MALE,
          category: { categoryName: 'U18', ageCategoryCode: 'U18' },
          qualifyingProfiles: [
            {
              roundTarget: 1,
              structureProfiles: [{ drawSize: 8, qualifyingPositions: 4 }],
            },
          ],
          completeAllMatchUps: true,
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });

    expect(drawIds?.length).toEqual(1);
    const tr = tournamentEngine.getState().tournamentRecords[tournamentRecord.tournamentId];

    const r = scaleEngine.getTournamentPoints({
      tournamentRecord: tr,
      policyDefinitions: POLICY_RANKING_POINTS_CTS,
      level: 12,
    });
    expect(r.success).toEqual(true);

    // Collect every Q-stage award and assert at least one Q-final-loser
    // (rangeKey 2 = 2^1 — finishingRound 1 in a 2-round Q final) received
    // the Tabulka IV col+1 points.
    //
    // Filter on stage === QUALIFYING in addition to rangeAccessor === 2.
    // Without the stage gate, MAIN-finalists also match (their
    // finishingPositionRange max = 2) and intermittently contaminate
    // qFinalLoserAwards with pts=138 awards whenever the random mock
    // outcome produces a SINGLES finalist with that shape.
    const allAwards = Object.values(r.personPoints).flat();
    const qFinalLoserAwards = allAwards.filter(
      (a: any) => a.eventType === SINGLES && a.stage === QUALIFYING && a.rangeAccessor === 2,
    );
    expect(qFinalLoserAwards.length).toBeGreaterThan(0);
    // Tabulka IV row 12 col 5 = 33 pts (16-MAIN's "Q final loser" shift +1).
    for (const award of qFinalLoserAwards) {
      expect((award as any).points).toEqual(33);
    }
  });

  test('policy exposes one Q awardProfile per (level, Q drawSize) where columns exist', () => {
    const policyBlock = (POLICY_RANKING_POINTS_CTS as any)[Object.keys(POLICY_RANKING_POINTS_CTS)[0]];
    const profiles = policyBlock.awardProfiles ?? [];
    const qProfiles = profiles.filter((p: any) => p.stages?.includes(QUALIFYING));
    // 21 levels × 4 Q drawSizes (4, 8, 16, 32) max — minus low-level drops
    // where the shifted Tabulka IV column doesn't exist.
    expect(qProfiles.length).toBeGreaterThan(60);
    // Verify shape on the level-12 / Q-16 (→ MAIN-32) profile
    const sample = qProfiles.find((p: any) => p.levels?.includes(12) && p.drawSizes?.includes(32));
    expect(sample).toBeDefined();
    expect(sample.stages).toEqual([QUALIFYING]);
    // rangeKey 2 = Q-final loser. 32-MAIN R1 column = index 5 (33 pts);
    // shift +1 → column 6 = 23 pts.
    expect(sample.finishingPositionRanges[2]).toEqual(23);
    // rangeKey 4 = Q-SF loser → column 7 = 16 pts.
    expect(sample.finishingPositionRanges[4]).toEqual(16);
  });

  // MAIN-only sanity: the existing MAIN awardProfile path still produces
  // expected points after the QUALIFYING profiles were added to the policy.
  test('MAIN award still fires for direct-MAIN participants', () => {
    const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
      tournamentName: 'CTS MAIN-only test',
      participantsProfile: { participantsCount: 8, sex: MALE },
      tournamentAttributes: {
        tournamentTier: { system: 'CTS', value: 'A', numericRank: 12 },
      },
      drawProfiles: [
        {
          drawSize: 8,
          eventType: SINGLES,
          matchUpType: SINGLES,
          gender: MALE,
          category: { categoryName: 'U18', ageCategoryCode: 'U18' },
          completeAllMatchUps: true,
        },
      ],
      completeAllMatchUps: true,
      setState: true,
    });
    expect(drawIds?.length).toEqual(1);
    const tr = tournamentEngine.getState().tournamentRecords[tournamentRecord.tournamentId];
    const r = scaleEngine.getTournamentPoints({
      tournamentRecord: tr,
      policyDefinitions: POLICY_RANKING_POINTS_CTS,
      level: 12,
    });
    expect(r.success).toEqual(true);
    const mainR1LoserAwards = Object.values(r.personPoints)
      .flat()
      .filter(
        (a: any) => a.eventType === SINGLES && a.rangeAccessor === 8, // rangeKey 8 = R1 loser in 8-draw (loser range [5,8])
      );
    // Tabulka IV row 12 col 3 = 67 pts.
    for (const award of mainR1LoserAwards) {
      expect((award as any).points).toEqual(67);
    }
  });
});

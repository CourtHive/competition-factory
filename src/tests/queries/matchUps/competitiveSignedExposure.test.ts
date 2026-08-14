import { predictMatchUpCompetitiveBands } from '@Query/matchUp/predictMatchUpCompetitiveBands';
import { getMatchUpCompetitiveProfile } from '@Query/matchUp/getMatchUpCompetitiveProfile';
import { getCompetitiveProfile } from '@Query/matchUps/getCompetitiveProfile';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import { ANCHOR, COMPETITIVE, DECISIVE, DOWN, EVEN, ROUTINE, STRETCH, UP } from '@Constants/statsConstants';
import { INVALID_POLICY_DEFINITION, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { UTR, WTN } from '@Constants/ratingConstants';
import POLICY_COMPETITIVE_BANDS_DEFAULT from '@Fixtures/policies/POLICY_COMPETITIVE_BANDS_DEFAULT';

const DEFAULT_POLICY = POLICY_COMPETITIVE_BANDS_DEFAULT;
const REALIZED_ONLY_POLICY = {
  [POLICY_TYPE_COMPETITIVE_BANDS]: { profileBands: { [DECISIVE]: 20, [ROUTINE]: 50 } },
};

const wtnParticipant = (participantId: string, wtnRating?: number) => ({
  participantId,
  ...(wtnRating === undefined ? {} : { ratings: { [SINGLES]: [{ scaleName: WTN, scaleValue: { wtnRating } }] } }),
});

// 6-4 6-3 => 12 games to 7 => 58% spread => COMPETITIVE under the default 20/50 thresholds.
const COMPETITIVE_SETS = [
  { side1Score: 6, side2Score: 4 },
  { side1Score: 6, side2Score: 3 },
];

const singlesMatchUp = ({
  ownRating,
  oppRating,
  winningSide,
  sets = COMPETITIVE_SETS,
  ownId = 'p1',
  oppId = 'opp',
}: any) => ({
  matchUpType: SINGLES,
  ...(winningSide ? { winningSide } : {}),
  score: { sets },
  sides: [
    { sideNumber: 1, participant: wtnParticipant(ownId, ownRating) },
    { sideNumber: 2, participant: wtnParticipant(oppId, oppRating) },
  ],
});

describe('getMatchUpCompetitiveProfile — the realized axis is untouched', () => {
  it('returns exactly what it returned before when no scaleName is given', () => {
    const matchUp: any = singlesMatchUp({ ownRating: 20, oppRating: 25, winningSide: 1 });

    // Byte-identical: same keys, same values. The signed axis engages ONLY on
    // `scaleName`, which is what makes this change invisible to existing callers.
    expect(getMatchUpCompetitiveProfile({ matchUp })).toEqual({
      competitiveness: COMPETITIVE,
      pctSpread: 58,
      success: true,
    });
  });

  it('realized output is identical with the signed axis engaged', () => {
    const matchUp: any = singlesMatchUp({ ownRating: 20, oppRating: 25, winningSide: 1 });

    const realized: any = getMatchUpCompetitiveProfile({ matchUp });
    const withSigned: any = getMatchUpCompetitiveProfile({
      policyDefinitions: DEFAULT_POLICY,
      scaleName: WTN,
      matchUp,
    });

    expect(withSigned.competitiveness).toEqual(realized.competitiveness);
    expect(withSigned.pctSpread).toEqual(realized.pctSpread);
  });
});

describe('getMatchUpCompetitiveProfile — signed exposure axis', () => {
  it('adds signedDelta and deltaBand from the perspective of side 1 by default', () => {
    const matchUp: any = singlesMatchUp({ ownRating: 20, oppRating: 25, winningSide: 1 });

    // WTN: own 20 vs opp 25 — the opponent's higher WTN is WEAKER, so this is
    // playing down by 5, past the -4.017 (10.3% of 39) ANCHOR boundary.
    expect(getMatchUpCompetitiveProfile({ policyDefinitions: DEFAULT_POLICY, scaleName: WTN, matchUp })).toEqual({
      competitiveness: COMPETITIVE,
      perspectiveSideNumber: 1,
      deltaBand: ANCHOR,
      signedDelta: -5,
      pctSpread: 58,
      success: true,
    });
  });

  it('inverts for the other participant — same matchUp, opposite exposure', () => {
    const matchUp: any = singlesMatchUp({ ownRating: 20, oppRating: 25, winningSide: 1 });

    const result: any = getMatchUpCompetitiveProfile({
      policyDefinitions: DEFAULT_POLICY,
      participantId: 'opp',
      scaleName: WTN,
      matchUp,
    });

    expect(result.signedDelta).toEqual(5);
    expect(result.deltaBand).toEqual(STRETCH);
    expect(result.perspectiveSideNumber).toEqual(2);
  });

  it('honours an explicit sideNumber', () => {
    const matchUp: any = singlesMatchUp({ ownRating: 20, oppRating: 25, winningSide: 1 });
    const result: any = getMatchUpCompetitiveProfile({
      policyDefinitions: DEFAULT_POLICY,
      scaleName: WTN,
      sideNumber: 2,
      matchUp,
    });
    expect(result.signedDelta).toEqual(5);
    expect(result.perspectiveSideNumber).toEqual(2);
  });

  it('returns the delta and NO band when policy declares no deltaBands', () => {
    const matchUp: any = singlesMatchUp({ ownRating: 20, oppRating: 25, winningSide: 1 });

    const result: any = getMatchUpCompetitiveProfile({
      policyDefinitions: REALIZED_ONLY_POLICY,
      scaleName: WTN,
      matchUp,
    });

    expect(result.signedDelta).toEqual(-5);
    expect(result.deltaBand).toBeUndefined();
    expect('deltaBand' in result).toEqual(false);
  });

  it('returns no signedDelta when either side is unrated, and no error', () => {
    const matchUp: any = singlesMatchUp({ ownRating: 20, oppRating: undefined, winningSide: 1 });

    const result: any = getMatchUpCompetitiveProfile({
      policyDefinitions: DEFAULT_POLICY,
      scaleName: WTN,
      matchUp,
    });

    expect(result.error).toBeUndefined();
    expect(result.signedDelta).toBeUndefined();
    expect(result.competitiveness).toEqual(COMPETITIVE);
  });

  it('surfaces an unresolvable scale orientation as an error', () => {
    const matchUp: any = {
      ...singlesMatchUp({ ownRating: 20, oppRating: 25, winningSide: 1 }),
      sides: [
        {
          sideNumber: 1,
          participant: {
            participantId: 'p1',
            ratings: { [SINGLES]: [{ scaleName: 'HOUSE_LADDER', scaleValue: 10 }] },
          },
        },
        {
          sideNumber: 2,
          participant: {
            participantId: 'opp',
            ratings: { [SINGLES]: [{ scaleName: 'HOUSE_LADDER', scaleValue: 14 }] },
          },
        },
      ],
    };

    const result: any = getMatchUpCompetitiveProfile({
      policyDefinitions: DEFAULT_POLICY,
      scaleName: 'HOUSE_LADDER',
      matchUp,
    });
    expect(result.error).toEqual(MISSING_VALUE);

    // ...and an explicit orientation makes the same data resolvable. `maxPct`
    // still cannot apply to a range-less scale, so bands come in absolute units.
    const oriented: any = getMatchUpCompetitiveProfile({
      deltaBands: [{ key: DOWN, max: -1 }, { key: EVEN, max: 1 }, { key: UP }],
      scaleName: 'HOUSE_LADDER',
      ascending: false,
      matchUp,
    });
    expect(oriented.signedDelta).toEqual(4);
    expect(oriented.deltaBand).toEqual(UP);
  });

  it('surfaces an invalid deltaBands policy rather than dropping the band', () => {
    const matchUp: any = singlesMatchUp({ ownRating: 20, oppRating: 25, winningSide: 1 });
    const result: any = getMatchUpCompetitiveProfile({
      deltaBands: [{ key: UP, max: 4, maxPct: 10 }, { key: STRETCH }],
      scaleName: WTN,
      matchUp,
    });
    expect(result.error).toEqual(INVALID_POLICY_DEFINITION);
    expect(result.competitiveness).toBeUndefined();
  });

  it('averages a doubles pair rather than summing it', () => {
    const pair = (participantId: string, ratings: number[]) => ({
      participantId,
      individualParticipants: ratings.map((wtnRating, index) => ({
        participantId: `${participantId}-${index}`,
        ratings: { [DOUBLES]: [{ scaleName: WTN, scaleValue: { wtnRating } }] },
      })),
    });

    const matchUp: any = {
      matchUpType: DOUBLES,
      winningSide: 1,
      score: { sets: COMPETITIVE_SETS },
      sides: [
        { sideNumber: 1, participant: pair('pair1', [20, 22]) },
        { sideNumber: 2, participant: pair('pair2', [24, 26]) },
      ],
    };

    const result: any = getMatchUpCompetitiveProfile({
      policyDefinitions: DEFAULT_POLICY,
      scaleName: WTN,
      matchUp,
    });

    // Means are 21 and 25 => -4, which is DOWN. Summing would give 42 vs 50 =>
    // -8 => ANCHOR, so this assertion discriminates the two implementations.
    expect(result.signedDelta).toEqual(-4);
    expect(result.deltaBand).toEqual(DOWN);
  });

  it('an individual with no rating makes the whole pair unrated', () => {
    const matchUp: any = {
      matchUpType: DOUBLES,
      winningSide: 1,
      score: { sets: COMPETITIVE_SETS },
      sides: [
        {
          sideNumber: 1,
          participant: {
            participantId: 'pair1',
            individualParticipants: [
              { participantId: 'a', ratings: { [DOUBLES]: [{ scaleName: WTN, scaleValue: { wtnRating: 20 } }] } },
              { participantId: 'b' },
            ],
          },
        },
        {
          sideNumber: 2,
          participant: {
            participantId: 'pair2',
            individualParticipants: [
              { participantId: 'c', ratings: { [DOUBLES]: [{ scaleName: WTN, scaleValue: { wtnRating: 24 } }] } },
              { participantId: 'd', ratings: { [DOUBLES]: [{ scaleName: WTN, scaleValue: { wtnRating: 26 } }] } },
            ],
          },
        },
      ],
    };

    const result: any = getMatchUpCompetitiveProfile({
      policyDefinitions: DEFAULT_POLICY,
      scaleName: WTN,
      matchUp,
    });
    expect(result.signedDelta).toBeUndefined();
    expect(result.error).toBeUndefined();
  });
});

describe('predictMatchUpCompetitiveBands — signed delta is additive', () => {
  it('returns exactly the pre-existing shape when no orientation is requested', () => {
    const result: any = predictMatchUpCompetitiveBands({ side1Rating: 4.5, side2Rating: 5 });

    expect(Object.keys(result).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'competitive',
      'decisive',
      'delta',
      'routine',
    ]);
    expect(result.delta).toEqual(0.5);
    expect(result.signedDelta).toBeUndefined();
  });

  it('keeps delta ABSOLUTE while adding the signed value', () => {
    const utr: any = predictMatchUpCompetitiveBands({
      policyDefinitions: DEFAULT_POLICY,
      side1Rating: 4.5,
      side2Rating: 5,
      scaleName: UTR,
    });

    expect(utr.delta).toEqual(0.5); // unchanged: |4.5 - 5|
    expect(utr.signedDelta).toEqual(0.5); // UTR: higher is stronger, so side 2 was tougher
    // 10.3% of UTR's 15-point range is 1.545, and 1.3% is 0.195 => UP.
    expect(utr.deltaBand).toEqual(UP);

    const wtn: any = predictMatchUpCompetitiveBands({
      policyDefinitions: DEFAULT_POLICY,
      side1Rating: 4.5,
      side2Rating: 5,
      scaleName: WTN,
    });

    expect(wtn.delta).toEqual(0.5);
    expect(wtn.signedDelta).toEqual(-0.5); // WTN: lower is stronger — playing down
    // 1.3% of WTN's 39-point range is 0.507, so -0.5 is inside EVEN.
    expect(wtn.deltaBand).toEqual(EVEN);

    // Same ratings, same prediction — only the exposure reading differs.
    expect(wtn.competitive).toEqual(utr.competitive);
  });

  it('returns the signed delta with no band when policy declares no deltaBands', () => {
    const result: any = predictMatchUpCompetitiveBands({
      policyDefinitions: REALIZED_ONLY_POLICY,
      side1Rating: 4.5,
      side2Rating: 5,
      scaleName: UTR,
    });
    expect(result.signedDelta).toEqual(0.5);
    expect(result.deltaBand).toBeUndefined();
  });

  it('errors when an orientation was requested but cannot be established', () => {
    const result: any = predictMatchUpCompetitiveBands({
      side1Rating: 4.5,
      side2Rating: 5,
      scaleName: 'HOUSE_LADDER',
    });
    expect(result.error).toEqual(MISSING_VALUE);
    expect(result.competitive).toEqual(0);
  });

  it('accepts an explicit ascending with absolute-unit bands and no scaleName', () => {
    const result: any = predictMatchUpCompetitiveBands({
      deltaBands: [{ key: DOWN, max: -0.25 }, { key: EVEN, max: 0.25 }, { key: UP }],
      side1Rating: 4.5,
      side2Rating: 5,
      ascending: false,
    });
    expect(result.signedDelta).toEqual(0.5);
    expect(result.deltaBand).toEqual(UP);
    expect(result.delta).toEqual(0.5);
  });
});

describe('getCompetitiveProfile — pure aggregate over a matchUp array', () => {
  // Six matchUps for p1 (WTN 20) plus one it is not in. Deltas: -5 ANCHOR,
  // -4 DOWN, 0 EVEN, +4 UP, +5 STRETCH, and one unrated opponent.
  const matchUps: any[] = [
    singlesMatchUp({
      ownRating: 20,
      oppRating: 25,
      winningSide: 1,
      sets: [
        { side1Score: 6, side2Score: 0 },
        { side1Score: 6, side2Score: 0 },
      ],
    }),
    singlesMatchUp({
      ownRating: 20,
      oppRating: 24,
      winningSide: 1,
      sets: [
        { side1Score: 6, side2Score: 2 },
        { side1Score: 6, side2Score: 2 },
      ],
    }),
    singlesMatchUp({
      ownRating: 20,
      oppRating: 20,
      winningSide: 2,
      sets: [
        { side1Score: 4, side2Score: 6 },
        { side1Score: 3, side2Score: 6 },
      ],
    }),
    singlesMatchUp({
      ownRating: 20,
      oppRating: 16,
      winningSide: 2,
      sets: [
        { side1Score: 2, side2Score: 6 },
        { side1Score: 2, side2Score: 6 },
      ],
    }),
    // Not yet played: exposure is known, realized is not.
    singlesMatchUp({ ownRating: 20, oppRating: 15 }),
    singlesMatchUp({
      ownRating: 20,
      oppRating: undefined,
      winningSide: 1,
      sets: [
        { side1Score: 6, side2Score: 1 },
        { side1Score: 6, side2Score: 1 },
      ],
    }),
    singlesMatchUp({ ownId: 'q1', oppId: 'q2', ownRating: 30, oppRating: 31, winningSide: 1 }),
  ];

  it('counts both axes, with exact counts and ratios', () => {
    const profile: any = getCompetitiveProfile({
      policyDefinitions: DEFAULT_POLICY,
      participantId: 'p1',
      scaleName: WTN,
      matchUps,
    });

    expect(profile.matchUpsCount).toEqual(6); // the q1-vs-q2 matchUp is filtered out
    expect(profile.participantId).toEqual('p1');

    // Realized: only matchUps with a winningSide. 0% and 17% are DECISIVE,
    // 33% twice is ROUTINE, 58% is COMPETITIVE.
    expect(profile.realized.completed).toEqual(5);
    expect(profile.realized.counts).toEqual({ [DECISIVE]: 2, [ROUTINE]: 2, [COMPETITIVE]: 1 });
    expect(profile.realized.ratios).toEqual({ [DECISIVE]: 40, [ROUTINE]: 40, [COMPETITIVE]: 20 });

    // Exposure: the unplayed matchUp counts, the unrated one does not.
    expect(profile.exposure.rated).toEqual(5);
    expect(profile.exposure.unrated).toEqual(1);
    expect(profile.exposure.counts).toEqual({
      [ANCHOR]: 1,
      [DOWN]: 1,
      [EVEN]: 1,
      [UP]: 1,
      [STRETCH]: 1,
    });
    expect(profile.exposure.ratios).toEqual({
      [ANCHOR]: 20,
      [DOWN]: 20,
      [EVEN]: 20,
      [UP]: 20,
      [STRETCH]: 20,
    });
    expect(profile.exposure.meanSignedDelta).toEqual(0); // (-5 - 4 + 0 + 4 + 5) / 5
    expect(profile.exposure.deltaBandsApplied).toEqual(true);
  });

  it('zero-fills every band the policy declares, so a bar always has N segments', () => {
    const profile: any = getCompetitiveProfile({
      policyDefinitions: DEFAULT_POLICY,
      matchUps: [singlesMatchUp({ ownRating: 20, oppRating: 20, winningSide: 1 })],
      participantId: 'p1',
      scaleName: WTN,
    });

    expect(profile.exposure.counts).toEqual({
      [ANCHOR]: 0,
      [DOWN]: 0,
      [EVEN]: 1,
      [UP]: 0,
      [STRETCH]: 0,
    });
  });

  it('reports deltas with no bands when policy declares no deltaBands', () => {
    const profile: any = getCompetitiveProfile({
      policyDefinitions: REALIZED_ONLY_POLICY,
      participantId: 'p1',
      scaleName: WTN,
      matchUps,
    });

    expect(profile.exposure.deltaBandsApplied).toEqual(false);
    expect(profile.exposure.counts).toEqual({});
    expect(profile.exposure.ratios).toEqual({});
    // The delta axis itself still resolved — only the labelling was withheld.
    expect(profile.exposure.rated).toEqual(5);
    expect(profile.exposure.meanSignedDelta).toEqual(0);
    expect(profile.realized.counts).toEqual({ [DECISIVE]: 2, [ROUTINE]: 2, [COMPETITIVE]: 1 });
  });

  it('leaves the exposure axis idle when no scale is given', () => {
    const profile: any = getCompetitiveProfile({ policyDefinitions: DEFAULT_POLICY, participantId: 'p1', matchUps });

    expect(profile.exposure.rated).toEqual(0);
    expect(profile.exposure.unrated).toEqual(0);
    expect(profile.exposure.meanSignedDelta).toBeUndefined();
    expect(profile.realized.counts).toEqual({ [DECISIVE]: 2, [ROUTINE]: 2, [COMPETITIVE]: 1 });
  });

  it('takes side 1 as the perspective when no participantId is given', () => {
    const profile: any = getCompetitiveProfile({
      policyDefinitions: DEFAULT_POLICY,
      scaleName: WTN,
      matchUps,
    });

    expect(profile.matchUpsCount).toEqual(7); // no participant filter
    expect(profile.participantId).toBeUndefined();
    // Side 1 of the extra matchUp is WTN 30 against 31 => -1 => DOWN.
    expect(profile.exposure.counts[DOWN]).toEqual(2);
    expect(profile.exposure.rated).toEqual(6);
  });

  it('surfaces an invalid deltaBands policy once, not per matchUp', () => {
    const profile: any = getCompetitiveProfile({
      deltaBands: [{ key: DOWN, max: 1 }, { key: UP, max: 1 }, { key: STRETCH }],
      participantId: 'p1',
      scaleName: WTN,
      matchUps,
    });
    expect(profile.error).toEqual(INVALID_POLICY_DEFINITION);
    expect(profile.realized).toBeUndefined();
  });

  it('rejects a non-array matchUps argument', () => {
    expect(getCompetitiveProfile({ matchUps: undefined as any }).error).toBeDefined();
  });

  it('returns empty counts for a participant with no matchUps', () => {
    const profile: any = getCompetitiveProfile({
      policyDefinitions: DEFAULT_POLICY,
      participantId: 'nobody',
      scaleName: WTN,
      matchUps,
    });

    expect(profile.matchUpsCount).toEqual(0);
    expect(profile.realized.counts).toEqual({ [DECISIVE]: 0, [ROUTINE]: 0, [COMPETITIVE]: 0 });
    expect(profile.realized.ratios).toEqual({ [DECISIVE]: 0, [ROUTINE]: 0, [COMPETITIVE]: 0 });
    expect(profile.exposure.meanSignedDelta).toBeUndefined();
  });
});

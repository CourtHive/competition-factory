import { setSubscriptions, deleteNotices, getPayloads } from '@Global/state/globalState';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { settlementOutcome } from '@Validators/rotatingPartnerSettlement';
import { isCompetitionProfile } from '@Validators/competitionProfile';
import { writeModeMatrix } from '@Tests/testHarness/writeModeMatrix';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import schema from '@Global/schema/tournament.schema.json';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';

// constants and types
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED, RETIRED, WALKOVER, ABANDONED } from '@Constants/matchUpStatusConstants';
import { INVALID_VALUES, MUTATION_LOCKED, EXISTING_MATCHUPS } from '@Constants/errorConditionConstants';
import type { Tournament, Score, MatchUpStatusUnion } from '@Types/tournamentTypes';
import { DIRECT_ACCEPTANCE, UNGROUPED } from '@Constants/entryStatusConstants';
import type { RotatingPartnerTallyPolicy } from '@Types/rotatingPartnerTally';
import type { CompetitionProfile } from '@Types/competitionProfile';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { DOUBLES } from '@Constants/eventConstants';

type Format = 'AMERICANO' | 'MEXICANO';
type Variant = 'ALLOW' | 'DECIDING_POINT';
const enabled = {
  defaultVariant: { tieResolution: 'ALLOW' },
  permittedVariants: [{ tieResolution: 'ALLOW' }],
  timed: {
    defaultVariant: { tieResolution: 'ALLOW' },
    permittedVariants: [{ tieResolution: 'ALLOW' }, { tieResolution: 'DECIDING_POINT' }],
    permittedMinutes: [15, 20],
  },
};
const tally: RotatingPartnerTallyPolicy = {
  version: 1,
  decidingPoints: 'INCLUDE',
  overtimePoints: 'INCLUDE',
  statusTreatments: {},
};
function profile(format: Format, variant: Variant = 'ALLOW'): Exclude<CompetitionProfile, { format: 'LADDER' }> {
  return {
    version: 1,
    entrantScope: INDIVIDUAL,
    matchUpType: DOUBLES,
    scoring: { kind: 'TIMED', minutes: 15, selectedVariant: { tieResolution: variant } },
    standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
    ...(format === 'AMERICANO'
      ? { format, pairing: { seed: 42, algorithmVersion: 1 }, completion: { kind: 'PARTNERSHIP_COVERAGE' } }
      : {
          format,
          pairing: {
            seed: 42,
            algorithmVersion: 1,
            groupBy: 'ADJACENT_STANDINGS',
            partners: 'FIRST_FOURTH_SECOND_THIRD',
          },
          completion: { kind: 'ROUND_COUNT', rounds: 3 },
        }),
  };
}
function setup(format: Format, variant: Variant = 'ALLOW') {
  const ids = ['p0', 'p1', 'p2', 'p3'];
  const record: Tournament = {
    tournamentId: 't',
    participants: ids.map((participantId) => ({
      participantId,
      participantType: INDIVIDUAL,
      participantRole: COMPETITOR,
    })),
    extensions: [
      {
        name: APPLIED_POLICIES,
        value: {
          scoring: { rotatingPartners: { [format]: structuredClone(enabled) } },
          rotatingPartnerTally: structuredClone(tally),
        },
      },
    ],
    events: [
      {
        eventId: 'e',
        eventType: DOUBLES,
        entries: ids.map((participantId) => ({ participantId, entryStatus: UNGROUPED })),
        drawDefinitions: [
          {
            drawId: 'd',
            drawType: AD_HOC,
            matchUpType: DOUBLES,
            entries: ids.map((participantId) => ({ participantId, entryStatus: DIRECT_ACCEPTANCE })),
            structures: [{ structureId: 's', matchUps: [] }],
          },
        ],
      },
    ],
  };
  expect(tournamentEngine.setState(record).success).toBe(true);
  expect(tournamentEngine.setCompetitionProfile({ drawId: 'd', competitionProfile: profile(format, variant) })).toEqual(
    { success: true },
  );
  expect(tournamentEngine.setRotatingPartnerScoring({ drawId: 'd' }).success).toBe(true);
}
const record = () => tournamentEngine.getTournament().tournamentRecord;
const draw = () => record().events![0].drawDefinitions![0];
const match = () => matchUpsOf(draw().structures![0])![0];
function persisted(value: Tournament = record()) {
  const wire = JSON.stringify(value);
  return JSON.parse(wire);
}

function generate(roundNumber = 1) {
  const before = structuredClone(record());
  const preview = tournamentEngine.getRotatingPartnerRoundPreview({ drawId: 'd', roundNumber });
  expect(preview.error).toBeUndefined();
  expect(record()).toEqual(before);
  const request = {
    drawId: 'd',
    roundNumber,
    requestId: `r${roundNumber}`,
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  };
  expect(tournamentEngine.generateRotatingPartnerRound(request).success).toBe(true);
  return request;
}
function score(a: number, b: number): Score {
  return { sets: [{ setNumber: 1, side1Score: a, side2Score: b, ...(a === b ? {} : { winningSide: a > b ? 1 : 2 }) }] };
}
function write(
  entry: 'setMatchUpStatus' | 'setMatchUpState',
  values: { score: Score; matchUpStatus?: MatchUpStatusUnion; winningSide?: number },
) {
  const target = { drawId: 'd', matchUpId: match().matchUpId };
  return entry === 'setMatchUpStatus'
    ? tournamentEngine.setMatchUpStatus({ ...target, outcome: values })
    : tournamentEngine.setMatchUpState({ ...target, ...values });
}
afterEach(() => setSubscriptions({ subscriptions: {} }));

writeModeMatrix(() => {
  describe.each(['AMERICANO', 'MEXICANO'] as const)('%s timed factory activation', (format) => {
    it.each(['ALLOW', 'DECIDING_POINT'] as const)(
      'generates, persists and retries the %s historical contract',
      (variant) => {
        setup(format, variant);
        const request = generate();
        expect(match().matchUpFormat).toBe(`SET1-S:T15P${variant === 'DECIDING_POINT' ? '/TB1' : ''}`);
        expect(draw().competitionRounds![0].scoringContract).toEqual({
          kind: 'TIMED',
          minutes: 15,
          tieResolution: variant,
        });
        const before = structuredClone(record());
        expect(tournamentEngine.generateRotatingPartnerRound(request)).toMatchObject({
          success: true,
          existingRound: true,
        });
        expect(record()).toEqual(before);
        expect(tournamentEngine.setState(persisted(before)).success).toBe(true);
        expect(tournamentEngine.generateRotatingPartnerRound(request).existingRound).toBe(true);
      },
    );

    it.each(['setMatchUpStatus', 'setMatchUpState'] as const)(
      'keeps live scores live and credits actual points through %s',
      (entry) => {
        setup(format);
        generate();
        const live = score(11, 8);
        delete live.sets![0].winningSide;
        expect(write(entry, { score: live, matchUpStatus: IN_PROGRESS }).success).toBe(true);
        expect(match().matchUpStatus).toBe(IN_PROGRESS);
        expect(tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' }).unresolved).toHaveLength(1);
        expect(write(entry, { score: score(11, 8), matchUpStatus: COMPLETED, winningSide: 1 }).success).toBe(true);
        const standings = tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' });
        expect(standings.error).toBeUndefined();
        expect(standings.standings!.map((row) => row.pointsScored).toSorted((a, b) => b - a)).toEqual([11, 11, 8, 8]);
        expect(standings.contributions!.every((row) => row.extraPoints === 0)).toBe(true);
        expect(write(entry, { score: score(8, 11), matchUpStatus: COMPLETED, winningSide: 2 }).success).toBe(true);
        expect(
          tournamentEngine
            .getRotatingPartnerStandings({ drawId: 'd' })
            .standings!.map((row) => row.pointsScored)
            .toSorted((a, b) => b - a),
        ).toEqual([11, 11, 8, 8]);
        expect(tournamentEngine.getRotatingPartnerRoundPreview({ drawId: 'd', roundNumber: 2 }).success).toBe(true);
      },
    );
  });
});

it('admits timed profile JSON together with runtime validation', () => {
  const validate = addFormats(new Ajv({ allowUnionTypes: true })).compile({
    $ref: '#/definitions/CompetitionProfile',
    definitions: schema.definitions,
  });
  expect(validate(profile('AMERICANO'))).toBe(true);
  expect(isCompetitionProfile(profile('AMERICANO'))).toBe(true);
});

function changeRules(scoringPolicy: unknown, tallyPolicy: unknown = tally) {
  const saved = record();
  const format = draw().competitionProfile!.format;
  saved.extensions = [
    {
      name: APPLIED_POLICIES,
      value: {
        scoring: { rotatingPartners: { [format]: scoringPolicy } },
        rotatingPartnerTally: tallyPolicy,
      },
    },
  ];
  expect(tournamentEngine.setState(saved).success).toBe(true);
}

writeModeMatrix(() => {
  describe.each(['AMERICANO', 'MEXICANO'] as const)('%s timed contract boundaries', (format) => {
    it.each(['setMatchUpStatus', 'setMatchUpState'] as const)(
      'retains ALLOW ties, corrections and clear through %s',
      (entry) => {
        setup(format);
        generate();
        expect(write(entry, { score: score(9, 9), matchUpStatus: COMPLETED }).success).toBe(true);
        expect(match().winningSide).toBeUndefined();
        const standings = tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' });
        expect(standings.standings!.every((row) => row.pointsScored === 9 && row.matchesTied === 1)).toBe(true);
        generate(2);
        const snapshot = structuredClone(draw().competitionRounds![1].standingsSnapshot);
        expect(write(entry, { score: { sets: [] }, matchUpStatus: TO_BE_PLAYED }).success).toBe(true);
        expect(
          tournamentEngine
            .getRotatingPartnerStandings({ drawId: 'd' })
            .unresolved!.some((row) => row.matchUpId === match().matchUpId),
        ).toBe(true);
        expect(draw().competitionRounds![1].standingsSnapshot).toEqual(snapshot);
        if (format === 'MEXICANO')
          expect(tournamentEngine.getRotatingPartnerRoundPreview({ drawId: 'd', roundNumber: 3 }).error).toBe(
            INVALID_VALUES,
          );
      },
    );

    it.each(['setMatchUpStatus', 'setMatchUpState'] as const)(
      'refuses invalid completions atomically without notices through %s',
      (entry) => {
        setup(format, 'DECIDING_POINT');
        generate();
        const notices: unknown[] = [];
        setSubscriptions({
          subscriptions: { [MODIFY_MATCHUP]: (notice: unknown) => notices.push(structuredClone(notice)) },
        });
        deleteNotices();
        const before = structuredClone(record());
        for (const values of [
          { score: score(0, 0) },
          { score: score(9, 9) },
          { score: score(11, 8), winningSide: 2 },
          ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1].map((value) => ({
            score: score(value, 8),
            winningSide: value > 8 ? 1 : 2,
          })),
        ]) {
          expect(write(entry, { ...values, matchUpStatus: COMPLETED }).error).toBeDefined();
          expect(record()).toEqual(before);
          expect(getPayloads({ topic: MODIFY_MATCHUP })).toEqual([]);
          expect(notices).toEqual([]);
        }
        expect(write(entry, { score: score(11, 8), winningSide: 1, matchUpStatus: COMPLETED }).success).toBe(true);
        expect(notices.length).toBeGreaterThan(0);
      },
    );

    it.each(['setMatchUpStatus', 'setMatchUpState'] as const)(
      'credits both manual and scored deciding rallies through %s',
      (entry) => {
        for (const winner of [1, 2] as const) {
          const scorer = new ScoringEngine({ matchUpFormat: 'SET1-S:T15P/TB1' });
          for (let point = 0; point < 10; point++) {
            scorer.addPoint({ winner: 0 });
            scorer.addPoint({ winner: 1 });
          }
          scorer.endSegment();
          expect(scorer.getState().matchUpStatus).toBe(IN_PROGRESS);
          scorer.addPoint({ winner: winner === 1 ? 0 : 1 });
          expect(scorer.getState().matchUpStatus).toBe(COMPLETED);
          for (const result of [score(winner === 1 ? 11 : 10, winner === 1 ? 10 : 11), scorer.getState().score]) {
            setup(format, 'DECIDING_POINT');
            changeRules(enabled, { ...tally, overtimePoints: 'EXCLUDE' });
            generate();
            expect(write(entry, { score: result, winningSide: winner, matchUpStatus: COMPLETED }).success).toBe(true);
            const standings = tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' });
            expect(standings.error).toBeUndefined();
            expect(standings.standings!.map((row) => row.pointsScored).toSorted((a, b) => b - a)).toEqual([
              11, 11, 10, 10,
            ]);
            expect(standings.contributions!.every((row) => row.extraPoints === 0)).toBe(true);
            const wire = JSON.stringify(record());
            expect(tournamentEngine.setState(JSON.parse(wire)).success).toBe(true);
            expect(tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' }).standings).toEqual(
              standings.standings,
            );
          }
        }
      },
    );

    it('keeps saved rules and exact retries when current policy disables timed selection', () => {
      setup(format);
      const request = generate();
      changeRules(
        { defaultVariant: { tieResolution: 'ALLOW' }, permittedVariants: [{ tieResolution: 'ALLOW' }] },
        { ...tally, decidingPoints: 'EXCLUDE' },
      );
      expect(
        write('setMatchUpStatus', { score: score(11, 10), winningSide: 1, matchUpStatus: COMPLETED }).success,
      ).toBe(true);
      const before = structuredClone(record());
      expect(tournamentEngine.generateRotatingPartnerRound(request).existingRound).toBe(true);
      expect(record()).toEqual(before);
      expect(
        tournamentEngine
          .getRotatingPartnerStandings({ drawId: 'd' })
          .standings!.map((row) => row.pointsScored)
          .toSorted((a, b) => b - a),
      ).toEqual([11, 11, 10, 10]);
      expect(tournamentEngine.getRotatingPartnerRoundPreview({ drawId: 'd', roundNumber: 2 }).info).toBe(
        'timed rotating-partner scoring is not enabled',
      );
      expect(
        tournamentEngine.setRotatingPartnerScoring({
          drawId: 'd',
          selectedVariant: { tieResolution: 'DECIDING_POINT' },
        }).error,
      ).toBe(INVALID_VALUES);
      expect(record()).toEqual(before);
    });
  });
});

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  'refuses public duration %s atomically',
  (minutes) => {
    setup('AMERICANO');
    const proposed = { ...profile('AMERICANO'), scoring: { kind: 'TIMED', minutes } } as CompetitionProfile;
    const before = structuredClone(record());
    expect(isCompetitionProfile(proposed)).toBe(false);
    expect(tournamentEngine.setCompetitionProfile({ drawId: 'd', competitionProfile: proposed }).error).toBe(
      INVALID_VALUES,
    );
    expect(record()).toEqual(before);
  },
);

it('refuses deciding-point exclusion at selection and revalidates it at generation', () => {
  setup('AMERICANO', 'DECIDING_POINT');
  const preview = tournamentEngine.getRotatingPartnerRoundPreview({ drawId: 'd', roundNumber: 1 });
  const requested = {
    drawId: 'd',
    roundNumber: 1,
    requestId: 'stale',
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  };
  changeRules(enabled, { ...tally, decidingPoints: 'EXCLUDE' });
  const before = structuredClone(record());
  expect(tournamentEngine.getRotatingPartnerScoringPolicy({ drawId: 'd' }).info).toBe(
    'timed deciding-point exclusion requires decided-result evidence',
  );
  expect(tournamentEngine.generateRotatingPartnerRound(requested).info).toBe(
    'timed deciding-point exclusion requires decided-result evidence',
  );
  expect(record()).toEqual(before);
});

it('uses the inherited structure tally before generating a timed deciding-point round', () => {
  setup('AMERICANO', 'DECIDING_POINT');
  const saved = record();
  saved.events![0].drawDefinitions![0].structures![0].extensions = [
    { name: APPLIED_POLICIES, value: { rotatingPartnerTally: { ...tally, decidingPoints: 'EXCLUDE' } } },
  ];
  expect(tournamentEngine.setState(saved).success).toBe(true);
  const before = structuredClone(record());
  expect(tournamentEngine.getRotatingPartnerRoundPreview({ drawId: 'd', roundNumber: 1 }).info).toBe(
    'timed deciding-point exclusion requires decided-result evidence',
  );
  expect(record()).toEqual(before);
});

it('normalizes explicit combined-point kinds for locked profiles, stored rounds and retries without rewriting history', () => {
  setup('AMERICANO');
  const combined = {
    ...profile('AMERICANO'),
    scoring: { combinedPointTotal: 32, selectedVariant: { tieResolution: 'ALLOW' } },
  } as Exclude<CompetitionProfile, { format: 'LADDER' }>;
  expect(tournamentEngine.setCompetitionProfile({ drawId: 'd', competitionProfile: combined }).success).toBe(true);
  const request = generate();
  const before = structuredClone(record());
  const explicit = { ...combined, scoring: { ...combined.scoring, kind: 'COMBINED_POINTS' } } as CompetitionProfile;
  expect(tournamentEngine.setCompetitionProfile({ drawId: 'd', competitionProfile: explicit }).success).toBe(true);
  expect(record()).toEqual(before);
  const expectedScoringContract = { ...request.expectedScoringContract, kind: 'COMBINED_POINTS' as const };
  expect(tournamentEngine.generateRotatingPartnerRound({ ...request, expectedScoringContract }).existingRound).toBe(
    true,
  );
  expect(record()).toEqual(before);
  const wire = persisted(before);
  wire.events[0].drawDefinitions[0].competitionRounds[0].scoringContract.kind = 'COMBINED_POINTS';
  wire.events[0].drawDefinitions[0].competitionProfile.scoring.kind = 'COMBINED_POINTS';
  expect(tournamentEngine.setState(wire).success).toBe(true);
  expect(tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' }).error).toBeUndefined();
  expect(tournamentEngine.generateRotatingPartnerRound(request).existingRound).toBe(true);
  expect(tournamentEngine.setCompetitionProfile({ drawId: 'd', competitionProfile: combined }).success).toBe(true);
  expect(draw().competitionProfile).toMatchObject({ format: 'AMERICANO', scoring: { kind: 'COMBINED_POINTS' } });
  expect(draw().competitionRounds![0].scoringContract.kind).toBe('COMBINED_POINTS');
});

it.each(['minutes', 'format', 'both'] as const)(
  'refuses historical timed %s tampering without a partial write',
  (field) => {
    setup('AMERICANO');
    const request = generate();
    const wire = persisted();
    const definition = wire.events[0].drawDefinitions[0];
    if (field !== 'format') definition.competitionRounds[0].scoringContract.minutes = 20;
    if (field !== 'minutes') definition.structures[0].matchUps[0].matchUpFormat = 'SET1-S:T20P';
    expect(tournamentEngine.setState(wire).success).toBe(true);
    const before = structuredClone(record());
    expect(tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' }).error).toBe(INVALID_VALUES);
    expect(tournamentEngine.generateRotatingPartnerRound(request).error).toBe(INVALID_VALUES);
    for (const entry of ['setMatchUpStatus', 'setMatchUpState'] as const) {
      expect(write(entry, { score: score(11, 8), winningSide: 1, matchUpStatus: COMPLETED }).error).toBe(
        INVALID_VALUES,
      );
      expect(record()).toEqual(before);
    }
  },
);

it('does not infer timed completion from an untied score without an explicit status', () => {
  setup('AMERICANO');
  generate();
  const live = score(11, 8);
  delete live.sets![0].winningSide;
  expect(write('setMatchUpStatus', { score: live })).toMatchObject({ success: true });
  expect(match().matchUpStatus).toBe(IN_PROGRESS);
  expect(tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' }).unresolved).toHaveLength(1);
});

it.each(['ALLOW', 'DECIDING_POINT'] as const)('preserves scoring and mutation locks for timed %s', (variant) => {
  setup('AMERICANO', variant);
  const preview = tournamentEngine.getRotatingPartnerRoundPreview({ drawId: 'd', roundNumber: 1 });
  const request = {
    drawId: 'd',
    roundNumber: 1,
    requestId: 'locked',
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  };
  expect(tournamentEngine.addMutationLock({ drawId: 'd', scope: 'DRAWS', lockToken: 'timed-lock' }).success).toBe(true);
  const before = structuredClone(record());
  expect(tournamentEngine.generateRotatingPartnerRound(request).error).toBe(MUTATION_LOCKED);
  expect(record()).toEqual(before);
  expect(tournamentEngine.generateRotatingPartnerRound({ ...request, lockToken: 'timed-lock' }).success).toBe(true);
  const changed = profile('AMERICANO', variant);
  if (changed.scoring.kind !== 'TIMED') throw new Error('expected timed profile');
  changed.scoring.minutes = 20;
  expect(
    tournamentEngine.setCompetitionProfile({ drawId: 'd', competitionProfile: changed, lockToken: 'timed-lock' }).error,
  ).toBe(EXISTING_MATCHUPS);
});

it.each([
  [RETIRED, { kind: 'PLAYED_POINTS' as const }, [3, 3, 1, 1]],
  [ABANDONED, { kind: 'EXCLUDE' as const }, [0, 0, 0, 0]],
  [WALKOVER, { kind: 'CREDIT' as const, winningPoints: 20, losingPoints: 4 }, [20, 20, 4, 4]],
] as const)('keeps saved %s status treatment under timed scoring', (status, treatment, expected) => {
  setup('MEXICANO');
  changeRules(enabled, { ...tally, statusTreatments: { [status]: treatment } });
  generate();
  const wire = persisted();
  const target = wire.events[0].drawDefinitions[0].structures[0].matchUps[0];
  target.matchUpStatus = status;
  target.winningSide = 1;
  if (status === WALKOVER) delete target.score;
  else target.score = score(3, 1);
  expect(tournamentEngine.setState(wire).success).toBe(true);
  const standings = tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' });
  expect(standings.error).toBeUndefined();
  expect(standings.unresolved).toEqual([]);
  expect(standings.standings!.map((row) => row.pointsScored).toSorted((a, b) => b - a)).toEqual(expected);
  expect(tournamentEngine.getRotatingPartnerRoundPreview({ drawId: 'd', roundNumber: 2 }).success).toBe(true);
});

it('retains timed settlement retries, staleness, corrections and historical Mexicano snapshots', () => {
  setup('MEXICANO');
  generate();
  expect(write('setMatchUpStatus', { score: score(3, 1), matchUpStatus: RETIRED, winningSide: 1 }).success).toBe(true);
  expect(tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' }).unresolved).toHaveLength(1);
  const request = {
    drawId: 'd',
    matchUpId: match().matchUpId,
    requestId: 'settled',
    expectedOutcome: settlementOutcome(match()),
    treatment: { kind: 'PLAYED_POINTS' as const },
    reason: 'Count the recorded timed play',
    recordedBy: 'director',
    recordedAt: '2026-11-09T20:00:00Z',
  };
  expect(tournamentEngine.settleRotatingPartnerResult(request).success).toBe(true);
  const before = structuredClone(record());
  expect(tournamentEngine.settleRotatingPartnerResult(request).existingSettlement).toBe(true);
  expect(record()).toEqual(before);
  expect(
    tournamentEngine
      .getRotatingPartnerStandings({ drawId: 'd' })
      .standings!.map((row) => row.pointsScored)
      .toSorted((a, b) => b - a),
  ).toEqual([3, 3, 1, 1]);
  generate(2);
  const snapshot = structuredClone(draw().competitionRounds![1].standingsSnapshot);
  expect(write('setMatchUpStatus', { score: score(4, 1), matchUpStatus: RETIRED, winningSide: 1 }).success).toBe(true);
  expect(tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' }).staleSettlementIds).toEqual(['settled']);
  expect(
    tournamentEngine
      .getRotatingPartnerStandings({ drawId: 'd' })
      .unresolved!.some((row) => row.matchUpId === match().matchUpId),
  ).toBe(true);
  expect(write('setMatchUpStatus', { score: score(11, 8), matchUpStatus: COMPLETED, winningSide: 1 }).success).toBe(
    true,
  );
  expect(
    tournamentEngine
      .getRotatingPartnerStandings({ drawId: 'd' })
      .contributions!.filter((row) => row.matchUpId === match().matchUpId)
      .every((row) => !row.settlementRequestId && row.treatment === COMPLETED),
  ).toBe(true);
  expect(draw().competitionRounds![1].standingsSnapshot).toEqual(snapshot);
});

it('detects overflow when actual timed rally totals accumulate across rounds', () => {
  setup('AMERICANO');
  generate();
  expect(
    write('setMatchUpStatus', { score: score(Number.MAX_SAFE_INTEGER, 0), winningSide: 1, matchUpStatus: COMPLETED })
      .success,
  ).toBe(true);
  expect(tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' }).error).toBeUndefined();
  generate(2);
  const wire = persisted();
  for (const target of wire.events[0].drawDefinitions[0].structures[0].matchUps) {
    target.score = score(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    target.matchUpStatus = COMPLETED;
    delete target.winningSide;
  }
  expect(tournamentEngine.setState(wire).success).toBe(true);
  const before = structuredClone(record());
  expect(tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' }).info).toBe(
    'individual points exceed safe integer totals',
  );
  expect(record()).toEqual(before);
});

it('checks a known single structure tally before accepting timed deciding-point selection', () => {
  setup('AMERICANO');
  const saved = record();
  const definition = saved.events![0].drawDefinitions![0];
  delete definition.competitionProfile;
  definition.structures![0].extensions = [
    {
      name: APPLIED_POLICIES,
      value: {
        rotatingPartnerTally: { ...tally, decidingPoints: 'EXCLUDE' },
      },
    },
  ];
  expect(tournamentEngine.setState(saved).success).toBe(true);
  const before = structuredClone(record());
  expect(
    tournamentEngine.setCompetitionProfile({ drawId: 'd', competitionProfile: profile('AMERICANO', 'DECIDING_POINT') })
      .info,
  ).toBe('timed deciding-point exclusion requires decided-result evidence');
  expect(record()).toEqual(before);
});

it.each(['minutes', 'variant', 'mixed fields', 'unknown kind'] as const)(
  'keeps runtime and public profile schema aligned for invalid %s',
  (field) => {
    const configurations = {
      minutes: { kind: 'TIMED', minutes: 1.5 },
      variant: { kind: 'TIMED', minutes: 15, selectedVariant: { tieResolution: 'WIN_BY_MARGIN', winningMargin: 2 } },
      'mixed fields': { kind: 'TIMED', minutes: 15, combinedPointTotal: 32 },
      'unknown kind': { kind: 'OTHER', minutes: 15 },
    };
    const scoring = configurations[field];
    const proposed = { ...profile('AMERICANO'), scoring };
    const validate = addFormats(new Ajv({ allowUnionTypes: true })).compile({
      $ref: '#/definitions/CompetitionProfile',
      definitions: schema.definitions,
    });
    expect(validate(proposed)).toBe(false);
    expect(isCompetitionProfile(proposed)).toBe(false);
  },
);

it('requires every saved timed tally to retain supported deciding-point semantics', () => {
  setup('AMERICANO', 'DECIDING_POINT');
  const request = generate();
  const wire = persisted();
  wire.events[0].drawDefinitions[0].competitionRounds[0].tallyContract.decidingPoints = 'EXCLUDE';
  expect(tournamentEngine.setState(wire).success).toBe(true);
  const before = structuredClone(record());
  expect(tournamentEngine.getRotatingPartnerStandings({ drawId: 'd' }).error).toBe(INVALID_VALUES);
  expect(tournamentEngine.generateRotatingPartnerRound(request).error).toBe(INVALID_VALUES);
  expect(record()).toEqual(before);
});

it.each(['ALLOW', 'DECIDING_POINT'] as const)(
  'uses the generated %s format for timing and venue allowances',
  (variant) => {
    setup('AMERICANO', variant);
    generate();
    const matchUpFormat = match().matchUpFormat!;
    expect(tournamentEngine.getMatchUpFormatTiming({ matchUpFormat }).averageMinutes).toBe(15);
    expect(
      tournamentEngine.attachPolicies({
        policyDefinitions: {
          scheduling: {
            matchUpAverageTimes: [
              { matchUpFormatCodes: [matchUpFormat], averageTimes: [{ minutes: { default: 21 } }] },
            ],
          },
        },
      }).success,
    ).toBe(true);
    expect(tournamentEngine.getMatchUpFormatTiming({ matchUpFormat }).averageMinutes).toBe(21);
    expect(draw().competitionRounds![0].scoringContract).toMatchObject({ kind: 'TIMED', minutes: 15 });
  },
);

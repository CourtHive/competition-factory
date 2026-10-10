import { getRotatingPartnerRoundPreview } from '@Query/drawDefinition/getRotatingPartnerRoundPreview';
import { generateRotatingPartnerRound } from '@Mutate/drawDefinitions/generateRotatingPartnerRound';
import { getRotatingPartnerTallyPolicy } from '@Query/drawDefinition/getRotatingPartnerTallyPolicy';
import { getRotatingPartnerStandings } from '@Query/drawDefinition/getRotatingPartnerStandings';
import { isRotatingPartnerTallyPolicy } from '@Validators/rotatingPartnerTallyPolicy';
import schema from '@Global/schema/tournament.schema.json';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import Ajv from 'ajv';

// constants and types
import { INVALID_SCORE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { RotatingPartnerTallyPolicy } from '@Types/rotatingPartnerTally';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';

const policy: RotatingPartnerTallyPolicy = {
  version: 1,
  decidingPoints: 'INCLUDE',
  overtimePoints: 'INCLUDE',
  statusTreatments: {},
};
function setup(
  format: 'AMERICANO' | 'MEXICANO' = 'AMERICANO',
  tieResolution: 'ALLOW' | 'DECIDING_POINT' | 'WIN_BY_MARGIN' = 'ALLOW',
) {
  const ids = Array.from({ length: 8 }, (_, index) => `p${index}`);
  const drawDefinition: DrawDefinition = {
    drawId: 'd',
    drawType: 'AD_HOC',
    matchUpType: 'DOUBLES',
    entries: ids.map((participantId) => ({ participantId, entryStatus: 'DIRECT_ACCEPTANCE' })),
    structures: [{ structureId: 's', matchUps: [] }],
    competitionProfile: {
      version: 1,
      entrantScope: 'INDIVIDUAL',
      matchUpType: 'DOUBLES',
      scoring: {
        combinedPointTotal: 32,
        selectedVariant: { tieResolution, ...(tieResolution === 'WIN_BY_MARGIN' ? { winningMargin: 2 } : {}) },
      },
      standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
      ...(format === 'AMERICANO'
        ? {
            format,
            pairing: { seed: 42, algorithmVersion: 1 },
            completion: { kind: 'PARTNERSHIP_COVERAGE' },
          }
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
    },
  };
  const event: Event = {
    eventId: 'e',
    eventType: 'DOUBLES',
    drawDefinitions: [drawDefinition],
    entries: ids.map((participantId) => ({ participantId, entryStatus: 'UNGROUPED' })),
  };
  const tournamentRecord: Tournament = {
    tournamentId: 't',
    events: [event],
    participants: ids.map((participantId) => ({
      participantId,
      participantType: 'INDIVIDUAL',
      participantRole: 'COMPETITOR',
    })),
  };
  return { tournamentRecord, drawDefinition, event, roundNumber: 1 };
}
function apply(context: ReturnType<typeof setup>) {
  const preview = getRotatingPartnerRoundPreview(context);
  expect(preview.error).toBeUndefined();
  const request = {
    ...context,
    requestId: `r${context.roundNumber}`,
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  };
  const result = generateRotatingPartnerRound(request);
  expect(result.error).toBeUndefined();
  return { preview, result, request };
}
function settle(context: ReturnType<typeof setup>, a = 17, b = 15) {
  for (const match of context.drawDefinition.structures![0].matchUps!) {
    match.matchUpStatus = 'COMPLETED';
    match.score = {
      sets: [{ setNumber: 1, side1Score: a, side2Score: b, ...(a === b ? {} : { winningSide: a > b ? 1 : 2 }) }],
    };
    match.winningSide = a > b ? 1 : 2;
    if (a === b) delete match.winningSide;
  }
}
function attach(context: ReturnType<typeof setup>, value: unknown) {
  context.drawDefinition.extensions = [{ name: APPLIED_POLICIES, value: { rotatingPartnerTally: value } }];
}

it('credits actual side points to both individuals, shares ranks and never mutates queried data', () => {
  const context = setup();
  const { result } = apply(context);
  settle(context);
  const before = structuredClone(context.tournamentRecord);
  const standings = getRotatingPartnerStandings(context);
  expect(standings.error).toBeUndefined();
  expect(standings.standings?.map((row) => row.pointsScored)).toEqual([17, 17, 17, 17, 15, 15, 15, 15]);
  expect(standings.standings?.map((row) => row.rank)).toEqual([1, 1, 1, 1, 5, 5, 5, 5]);
  expect(standings.contributions).toHaveLength(8);
  expect(
    standings.contributions
      ?.filter((row) => result.roundRecord!.pairings[0][0].includes(row.participantId))
      .map((row) => row.pointsScored),
  ).toEqual([17, 17]);
  expect(context.tournamentRecord).toEqual(before);
  standings.contributions![0].opponentIds.push('external');
  expect(context.tournamentRecord).toEqual(before);
});

it('counts completed shared ties and recomputes score corrections and clears immediately', () => {
  const context = setup();
  apply(context);
  settle(context, 16, 16);
  expect(getRotatingPartnerStandings(context).standings?.every((row) => row.matchesTied === 1 && row.rank === 1)).toBe(
    true,
  );
  settle(context, 20, 12);
  expect(getRotatingPartnerStandings(context).standings?.[0].pointsScored).toBe(20);
  const match = context.drawDefinition.structures![0].matchUps![0];
  match.matchUpStatus = 'TO_BE_PLAYED';
  delete match.score;
  delete match.winningSide;
  const result = getRotatingPartnerStandings(context);
  expect(result.unresolved).toHaveLength(1);
  expect(result.contributions).toHaveLength(4);
});

it.each(['DECIDING_POINT', 'WIN_BY_MARGIN'] as const)('explicitly includes or excludes %s extra points', (variant) => {
  for (const choice of ['INCLUDE', 'EXCLUDE'] as const) {
    const context = setup('AMERICANO', variant);
    attach(context, { ...policy, decidingPoints: choice, overtimePoints: choice });
    apply(context);
    settle(context, variant === 'DECIDING_POINT' ? 17 : 18, 16);
    const result = getRotatingPartnerStandings(context);
    expect(result.error).toBeUndefined();
    const terminalPoints = variant === 'DECIDING_POINT' ? 17 : 18;
    expect(result.standings?.[0].pointsScored).toBe(choice === 'EXCLUDE' ? 16 : terminalPoints);
    expect(result.contributions?.[0].extraPoints).toBe(variant === 'DECIDING_POINT' ? 1 : 2);
    expect(result.standings?.[0].matchesWon).toBe(1);
  }
});

it('preserves historical policy while applying a replacement only to the next round', () => {
  const context = setup('AMERICANO', 'DECIDING_POINT');
  apply(context);
  settle(context, 17, 16);
  attach(context, { ...policy, decidingPoints: 'EXCLUDE' });
  expect(getRotatingPartnerStandings(context).standings?.[0].pointsScored).toBe(17);
  context.roundNumber = 2;
  const second = apply(context);
  expect(second.result.roundRecord?.tallyContract.decidingPoints).toBe('EXCLUDE');
  expect(context.drawDefinition.competitionRounds![0].tallyContract.decidingPoints).toBe('INCLUDE');
});

it('keeps terminal nonstandard statuses unresolved by default and only settles explicit treatments', () => {
  for (const status of [
    'RETIRED',
    'WALKOVER',
    'DEFAULTED',
    'ABANDONED',
    'CANCELLED',
    'DOUBLE_WALKOVER',
    'DOUBLE_DEFAULT',
    'DEAD_RUBBER',
  ] as const) {
    const context = setup();
    apply(context);
    context.drawDefinition.structures![0].matchUps![0].matchUpStatus = status;
    expect(getRotatingPartnerStandings(context).unresolved).toHaveLength(2);
  }
  const excluded = setup();
  attach(excluded, { ...policy, statusTreatments: { CANCELLED: { kind: 'EXCLUDE' } } });
  apply(excluded);
  for (const match of excluded.drawDefinition.structures![0].matchUps!) match.matchUpStatus = 'CANCELLED';
  expect(getRotatingPartnerStandings(excluded).unresolved).toHaveLength(0);
  expect(getRotatingPartnerStandings(excluded).contributions).toHaveLength(0);
  const credited = setup();
  attach(credited, {
    ...policy,
    statusTreatments: { WALKOVER: { kind: 'CREDIT', winningPoints: 20, losingPoints: 0 } },
  });
  apply(credited);
  for (const match of credited.drawDefinition.structures![0].matchUps!) {
    match.matchUpStatus = 'WALKOVER';
    match.winningSide = 1;
  }
  const result = getRotatingPartnerStandings(credited);
  expect(result.contributions?.[0]).toMatchObject({ playedPoints: 0, creditedPoints: 20, treatment: 'CREDIT' });
  expect(result.standings?.[0]).toMatchObject({ pointsScored: 20, matchesPlayed: 0, matchesWon: 1 });
  delete credited.drawDefinition.structures![0].matchUps![0].winningSide;
  expect(getRotatingPartnerStandings(credited).error).toBe(INVALID_SCORE);
});

it('attributes partial retirement scores only under an explicit played-points rule', () => {
  const context = setup();
  attach(context, { ...policy, statusTreatments: { RETIRED: { kind: 'PLAYED_POINTS' } } });
  apply(context);
  for (const match of context.drawDefinition.structures![0].matchUps!) {
    match.matchUpStatus = 'RETIRED';
    match.winningSide = 2;
    match.score = { sets: [{ side1Score: 8, side2Score: 6 }] };
  }
  const result = getRotatingPartnerStandings(context);
  expect(result.error).toBeUndefined();
  expect(result.standings?.[0].pointsScored).toBe(8);
  expect(result.contributions?.[0].treatment).toBe('PLAYED_POINTS');
});

it('refuses missing historical contracts, invalid scores and altered pair membership', () => {
  const context = setup();
  apply(context);
  settle(context);
  const contract = context.drawDefinition.competitionRounds![0].tallyContract;
  let result: any = context.drawDefinition.competitionRounds![0];
  delete result.tallyContract;
  expect(getRotatingPartnerStandings(context).error).toBe(INVALID_VALUES);
  context.drawDefinition.competitionRounds![0].tallyContract = contract;
  context.drawDefinition.structures![0].matchUps![0].score!.sets![0].side1Score = 99;
  expect(getRotatingPartnerStandings(context).error).toBe(INVALID_SCORE);
  settle(context);
  context.tournamentRecord.participants!.find(
    (participant) => participant.participantType === 'PAIR',
  )!.individualParticipantIds = ['p0', 'p0'];
  expect(getRotatingPartnerStandings(context).error).toBe(INVALID_VALUES);
});

it('generates later Mexicano rounds from exact settled source standings and retains prior pairings on correction', () => {
  const context = setup('MEXICANO');
  apply(context);
  context.roundNumber = 2;
  expect(getRotatingPartnerRoundPreview(context).error).toBe(INVALID_VALUES);
  settle(context);
  const second = apply(context);
  expect(second.result.roundRecord?.standingsThroughRoundNumber).toBe(1);
  expect(second.result.roundRecord?.standingsSnapshot).toEqual(
    getRotatingPartnerStandings({ ...context, throughRoundNumber: 1 }).standings!.map(
      ({ participantId, pointsScored }) => ({ participantId, pointsScored }),
    ),
  );
  expect(generateRotatingPartnerRound(second.request).existingRound).toBe(true);
  const stored = structuredClone(second.result.roundRecord);
  settle(context, 16, 16);
  expect(context.drawDefinition.competitionRounds![1]).toEqual(stored);
  context.roundNumber = 3;
  expect(apply(context).result.error).toBeUndefined();
});

it('rechecks Mexicano approved pairings after score corrections without rejecting irrelevant changes', () => {
  const context = setup('MEXICANO');
  apply(context);
  settle(context);
  context.roundNumber = 2;
  const preview = getRotatingPartnerRoundPreview(context);
  const request = {
    ...context,
    requestId: 'r2',
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  };
  settle(context, 15, 17);
  expect(generateRotatingPartnerRound(request).error).toBe(INVALID_VALUES);
  expect(context.drawDefinition.competitionRounds).toHaveLength(1);
  const accepted = apply(context);
  expect(accepted.result.roundRecord?.standingsSnapshot).not.toEqual(preview.standingsSnapshot);
});

it('resolves whole policies through tournament/event/draw/structure and exposes the public engine queries', () => {
  const context = setup();
  const extension = [
    { name: APPLIED_POLICIES, value: { rotatingPartnerTally: { ...policy, decidingPoints: 'EXCLUDE' } } },
  ];
  context.tournamentRecord.extensions = extension;
  expect(getRotatingPartnerTallyPolicy(context).tallyPolicy?.decidingPoints).toBe('EXCLUDE');
  context.event.extensions = [{ name: APPLIED_POLICIES, value: { rotatingPartnerTally: policy } }];
  expect(getRotatingPartnerTallyPolicy(context).tallyPolicy?.decidingPoints).toBe('INCLUDE');
  attach(context, { ...policy, overtimePoints: 'EXCLUDE' });
  expect(getRotatingPartnerTallyPolicy(context).tallyPolicy?.overtimePoints).toBe('EXCLUDE');
  const structure = context.drawDefinition.structures![0];
  structure.extensions = extension;
  expect(getRotatingPartnerTallyPolicy({ ...context, structure }).tallyPolicy?.decidingPoints).toBe('EXCLUDE');
  apply(context);
  settle(context);
  tournamentEngine.setState(context.tournamentRecord);
  let result: any = tournamentEngine.getRotatingPartnerStandings({ drawId: 'd', throughRoundNumber: 1 });
  expect(result.standings).toHaveLength(8);
  result = tournamentEngine.getRotatingPartnerTallyPolicy({ drawId: 'd', structureId: 's' });
  expect(result.tallyPolicy.decidingPoints).toBe('EXCLUDE');
});

it('keeps runtime and closed JSON-schema tally validation in agreement', () => {
  const ajv = new Ajv({ strict: false });
  ajv.addSchema(schema, 'tournament');
  const validate = ajv.compile({ $ref: 'tournament#/definitions/RotatingPartnerTallyPolicy' });
  for (const value of [
    policy,
    { ...policy, statusTreatments: { WALKOVER: { kind: 'CREDIT', winningPoints: 20.5, losingPoints: 0 } } },
    null,
    {},
    { ...policy, version: 2 },
    { ...policy, overtimePoints: 'OTHER' },
    { ...policy, statusTreatments: { COMPLETED: { kind: 'EXCLUDE' } } },
    { ...policy, statusTreatments: { IN_PROGRESS: { kind: 'EXCLUDE' } } },
    { ...policy, extra: true },
    { ...policy, statusTreatments: { WALKOVER: { kind: 'CREDIT', winningPoints: -1, losingPoints: 0 } } },
  ]) {
    expect(isRotatingPartnerTallyPolicy(value)).toBe(validate(value));
  }
});

it('accepts score corrections that leave approved Mexicano pairings unchanged and saves the new source snapshot', () => {
  const context = setup('MEXICANO');
  apply(context);
  settle(context);
  context.roundNumber = 2;
  const preview = getRotatingPartnerRoundPreview(context);
  settle(context, 18, 14);
  expect(getRotatingPartnerRoundPreview(context).round).toEqual(preview.round);
  const result = generateRotatingPartnerRound({
    ...context,
    requestId: 'r2',
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  });
  expect(result.error).toBeUndefined();
  expect(result.roundRecord?.standingsSnapshot).not.toEqual(preview.standingsSnapshot);
});

it('refuses invalid cutoffs, missing rounds, duplicate match IDs and malformed saved memberships', () => {
  for (const cutoff of [-1, 0.5, 2, Number.NaN]) {
    const context = setup();
    apply(context);
    expect(getRotatingPartnerStandings({ ...context, throughRoundNumber: cutoff }).error).toBe(INVALID_VALUES);
  }
  for (const corrupt of [
    (round: any) => {
      round.roundNumber = 2;
    },
    (round: any) => {
      round.pairings[0] = ['p0', 'p1', 'p2', 'p3'];
    },
    (round: any) => {
      round.matchUpIds[1] = round.matchUpIds[0];
    },
    (round: any) => {
      round.algorithmVersion = 2;
    },
    (round: any) => {
      round.tallyContract.decidingPoints = 'OTHER';
    },
  ]) {
    const context = setup();
    apply(context);
    corrupt(context.drawDefinition.competitionRounds![0]);
    expect(getRotatingPartnerStandings(context).error).toBe(INVALID_VALUES);
  }
});

it('rejects malformed inherited tally rules before applying any part of a round', () => {
  const context = setup();
  attach(context, { ...policy, decidingPoints: 'OTHER' });
  const before = structuredClone(context.tournamentRecord);
  expect(getRotatingPartnerRoundPreview(context).error).toBe(INVALID_VALUES);
  expect(
    generateRotatingPartnerRound({
      ...context,
      requestId: 'bad',
      expectedPairings: [],
      expectedScoringContract: { combinedPointTotal: 32, tieResolution: 'ALLOW' },
    }).error,
  ).toBe(INVALID_VALUES);
  expect(context.tournamentRecord).toEqual(before);
});

it('separates awarded credits from an actual partial score kept on a retirement', () => {
  const context = setup();
  attach(context, { ...policy, statusTreatments: { RETIRED: { kind: 'CREDIT', winningPoints: 20, losingPoints: 0 } } });
  apply(context);
  for (const match of context.drawDefinition.structures![0].matchUps!) {
    match.matchUpStatus = 'RETIRED';
    match.winningSide = 1;
    match.score = { sets: [{ side1Score: 8, side2Score: 6 }] };
  }
  const result = getRotatingPartnerStandings(context);
  expect(result.error).toBeUndefined();
  expect(result.contributions?.[0]).toMatchObject({
    played: true,
    playedPoints: 8,
    creditedPoints: 20,
    pointsScored: 20,
  });
  expect(result.standings?.[0].matchesPlayed).toBe(1);
});

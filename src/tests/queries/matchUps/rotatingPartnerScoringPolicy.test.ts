import { getRotatingPartnerScoringPolicy } from '@Query/drawDefinition/getRotatingPartnerScoringPolicy';
import { isRotatingPartnerScoringPolicy } from '@Validators/rotatingPartnerScoringPolicy';
import { analyzeRotatingPartnerScore } from '@Query/matchUp/rotatingPartnerScore';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import type { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import type { RotatingPartnerScoringPolicy } from '@Types/rotatingPartnerScoring';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';

const locked: RotatingPartnerScoringPolicy = {
  defaultVariant: { tieResolution: 'DECIDING_POINT' },
  permittedVariants: [{ tieResolution: 'DECIDING_POINT' }],
  permittedPointTotals: [32],
};
const draw = (): DrawDefinition => ({
  drawId: 'rotating-draw',
  drawType: 'AD_HOC',
  matchUpType: 'DOUBLES',
  structures: [],
  competitionProfile: {
    version: 1,
    format: 'AMERICANO',
    entrantScope: 'INDIVIDUAL',
    matchUpType: 'DOUBLES',
    scoring: { combinedPointTotal: 32 },
    standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
    pairing: { seed: 42, algorithmVersion: 1 },
    completion: { kind: 'PARTNERSHIP_COVERAGE' },
  },
});
const extensions = (section: unknown) => [
  { name: APPLIED_POLICIES, value: { scoring: { rotatingPartners: section } } },
];

it('defaults to tied completion and exposes permitted organizer choices', () => {
  const result = getRotatingPartnerScoringPolicy({ drawDefinition: draw() });
  expect(result.selectionLocked).toBe(false);
  expect(result.scoringPolicy?.permittedVariants).toHaveLength(3);
  expect(result.contract).toEqual({ combinedPointTotal: 32, tieResolution: 'ALLOW' });
  expect(analyzeRotatingPartnerScore({ side1Points: 16, side2Points: 16, contract: result.contract! }).tied).toBe(true);
});

it('enforces a singleton policy and total restriction', () => {
  const drawDefinition = draw();
  drawDefinition.extensions = extensions({ AMERICANO: locked });
  expect(getRotatingPartnerScoringPolicy({ drawDefinition }).selectionLocked).toBe(true);
  expect(getRotatingPartnerScoringPolicy({ drawDefinition, selectedVariant: { tieResolution: 'ALLOW' } }).error).toBe(
    INVALID_VALUES,
  );
  if (drawDefinition.competitionProfile?.format === 'AMERICANO')
    drawDefinition.competitionProfile.scoring.combinedPointTotal = 24;
  expect(getRotatingPartnerScoringPolicy({ drawDefinition }).error).toBe(INVALID_VALUES);
});

it('honors whole-policy replacement through all four scopes', () => {
  const drawDefinition = draw();
  const tournamentRecord: Tournament = { tournamentId: 't', extensions: extensions({ AMERICANO: locked }) };
  const event: Event = { eventId: 'e', extensions: extensions({}) };
  expect(getRotatingPartnerScoringPolicy({ tournamentRecord, drawDefinition }).selectionLocked).toBe(true);
  expect(getRotatingPartnerScoringPolicy({ tournamentRecord, event, drawDefinition }).selectionLocked).toBe(false);
  drawDefinition.extensions = extensions({ AMERICANO: locked });
  expect(getRotatingPartnerScoringPolicy({ tournamentRecord, event, drawDefinition }).selectionLocked).toBe(true);
  const structure: Structure = { structureId: 's', extensions: extensions({}) };
  expect(getRotatingPartnerScoringPolicy({ tournamentRecord, event, drawDefinition, structure }).selectionLocked).toBe(
    false,
  );
});

it.each([null, [], 42, 'rules', { defaultVariant: { tieResolution: 'ALLOW' }, permittedVariants: [] }])(
  'refuses malformed governing rules %j',
  (policy) => {
    const drawDefinition = draw();
    drawDefinition.extensions = extensions({ AMERICANO: policy });
    expect(getRotatingPartnerScoringPolicy({ drawDefinition }).error).toBe(INVALID_VALUES);
  },
);

it.each([
  { ...locked, defaultVariant: { tieResolution: 'ALLOW' } },
  { ...locked, permittedVariants: [locked.defaultVariant, locked.defaultVariant] },
  { ...locked, permittedPointTotals: [32, 32] },
  { ...locked, permittedPointTotals: [-1] },
  { ...locked, permittedPointTotals: [] },
  { ...locked, extra: true },
  { ...locked, defaultVariant: { tieResolution: 'WIN_BY_MARGIN', winningMargin: 1 } },
])('validates policy boundaries %j', (policy) => expect(isRotatingPartnerScoringPolicy(policy)).toBe(false));

it('keeps format policies independent and returns copies', () => {
  const drawDefinition = draw();
  drawDefinition.extensions = extensions({ MEXICANO: locked });
  const first = getRotatingPartnerScoringPolicy({ drawDefinition });
  first.scoringPolicy!.permittedVariants.length = 0;
  expect(getRotatingPartnerScoringPolicy({ drawDefinition }).scoringPolicy?.permittedVariants).toHaveLength(3);
});

it('resolves by drawId through the public engine query', () => {
  const drawDefinition = draw();
  tournamentEngine.setState({ tournamentId: 't', events: [{ eventId: 'e', drawDefinitions: [drawDefinition] }] });
  expect(tournamentEngine.getRotatingPartnerScoringPolicy({ drawId: drawDefinition.drawId }).contract).toEqual({
    combinedPointTotal: 32,
    tieResolution: 'ALLOW',
  });
});

it('refuses missing or unsupported profiles', () => {
  expect(getRotatingPartnerScoringPolicy({}).error).toBe(MISSING_DRAW_DEFINITION);
  const drawDefinition = draw();
  drawDefinition.competitionProfile = { version: 1, format: 'LADDER' };
  expect(getRotatingPartnerScoringPolicy({ drawDefinition }).error).toBe(INVALID_VALUES);
});

it.each([null, [], 'bad', 0])('refuses a malformed format section %j', (section) => {
  const drawDefinition = draw();
  drawDefinition.extensions = extensions(section);
  expect(getRotatingPartnerScoringPolicy({ drawDefinition }).error).toBe(INVALID_VALUES);
});

it('permits an approved override and rejects a changed margin', () => {
  const drawDefinition = draw();
  const result = getRotatingPartnerScoringPolicy({
    drawDefinition,
    selectedVariant: { tieResolution: 'WIN_BY_MARGIN', winningMargin: 2 },
  });
  expect(result.contract).toEqual({ combinedPointTotal: 32, tieResolution: 'WIN_BY_MARGIN', winningMargin: 2 });
  expect(
    getRotatingPartnerScoringPolicy({
      drawDefinition,
      selectedVariant: { tieResolution: 'WIN_BY_MARGIN', winningMargin: 3 },
    }).error,
  ).toBe(INVALID_VALUES);
});

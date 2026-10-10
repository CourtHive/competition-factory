import { getRotatingPartnerScoringContract } from '@Query/drawDefinition/getRotatingPartnerScoringContract';

import { setSubscriptions, deleteNotices, getPayloads } from '@Global/state/globalState';
import { getCompetitionProfile } from '@Query/drawDefinition/getCompetitionProfile';
import { isCompetitionProfile } from '@Validators/competitionProfile';
import { writeModeMatrix } from '@Tests/testHarness/writeModeMatrix';
import schema from '@Global/schema/tournament.schema.json';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import Ajv from 'ajv';
import {
  setCompetitionProfile,
  removeCompetitionProfile,
  setRotatingPartnerScoring,
} from '@Mutate/drawDefinitions/competitionProfile';

// constants and types

import type { CompetitionProfile, MexicanoCompetitionProfile } from '@Types/competitionProfile';
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { AD_HOC, LADDER } from '@Constants/drawDefinitionConstants';
import { MODIFY_DRAW_DEFINITION } from '@Constants/topicConstants';
import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import {
  INVALID_VALUES,
  EXISTING_MATCHUPS,
  MISSING_DRAW_DEFINITION,
  MUTATION_LOCKED,
} from '@Constants/errorConditionConstants';

afterEach(() => setSubscriptions({ subscriptions: {} }));

const mexicano: MexicanoCompetitionProfile = {
  version: 1,
  format: 'MEXICANO',
  entrantScope: 'INDIVIDUAL',
  matchUpType: 'DOUBLES',
  scoring: { combinedPointTotal: 32 },
  standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
  pairing: { seed: 42, algorithmVersion: 1, groupBy: 'ADJACENT_STANDINGS', partners: 'FIRST_FOURTH_SECOND_THIRD' },
  completion: { kind: 'ROUND_COUNT', rounds: 7 },
};
const americano: CompetitionProfile = {
  ...mexicano,
  format: 'AMERICANO',
  pairing: { seed: 42, algorithmVersion: 1 },
  completion: { kind: 'PARTNERSHIP_COVERAGE' },
};
const ladder: CompetitionProfile = { version: 1, format: 'LADDER' };
const copy = <T>(value: T): T => structuredClone(value);
const draw = (): DrawDefinition => ({
  drawId: 'profile-draw',
  drawType: AD_HOC,
  matchUpType: 'DOUBLES',
  structures: [],
});

const validateSchema = new Ajv({ allowUnionTypes: true }).compile({
  $ref: '#/definitions/CompetitionProfile',
  definitions: schema.definitions,
});

describe('closed competition profile validation and CODES schema parity', () => {
  it.each([mexicano, americano, ladder])('accepts %j', (profile) => {
    expect(isCompetitionProfile(profile)).toBe(validateSchema(profile));
    expect(isCompetitionProfile(profile)).toBe(true);
    expect(validateSchema(profile)).toBe(true);
  });

  const invalid: unknown[] = [
    undefined,
    null,
    [],
    {},
    { ...mexicano, version: 2 },
    { ...mexicano, format: 'UNKNOWN' },
    { ...mexicano, extra: true },
    { ...ladder, pairing: mexicano.pairing },
    { ...mexicano, entrantScope: 'PAIR' },
    { ...mexicano, matchUpType: 'SINGLES' },
    { ...mexicano, scoring: { combinedPointTotal: 0 } },
    { ...mexicano, scoring: { combinedPointTotal: 1.5 } },
    { ...mexicano, scoring: { combinedPointTotal: Number.MAX_SAFE_INTEGER + 1 } },
    { ...mexicano, scoring: { combinedPointTotal: 32, tiedResult: 'ALLOW' } },
    { ...mexicano, standings: { metric: 'WINS', attribution: 'EACH_INDIVIDUAL' } },
    { ...mexicano, pairing: { ...mexicano.pairing, seed: 1.5 } },
    { ...mexicano, pairing: { ...mexicano.pairing, algorithmVersion: 2 } },
    { ...mexicano, pairing: { ...mexicano.pairing, partners: 'FIRST_SECOND_THIRD_FOURTH' } },
    { ...mexicano, completion: { kind: 'ROUND_COUNT', rounds: 0 } },
    { ...americano, pairing: mexicano.pairing },
    { ...americano, completion: { kind: 'ROUND_COUNT', rounds: 7 } },
  ];
  it.each(invalid.map((profile) => ({ profile })))('refuses malformed profile %j without writes', ({ profile }) => {
    const drawDefinition = draw();
    const before = copy(drawDefinition);
    expect(isCompetitionProfile(profile)).toBe(validateSchema(profile));
    expect(isCompetitionProfile(profile)).toBe(false);
    expect(validateSchema(profile)).toBe(false);
    expect(setCompetitionProfile({ drawDefinition, competitionProfile: profile as CompetitionProfile }).error).toBe(
      INVALID_VALUES,
    );
    expect(drawDefinition).toEqual(before);
  });
});

writeModeMatrix(() => {
  it('stores a first-class attribute and emits the ordinary draw notice', () => {
    const drawDefinition = draw();
    const profile = copy(mexicano);
    setSubscriptions({ subscriptions: { [MODIFY_DRAW_DEFINITION]: () => {} } });
    deleteNotices();
    expect(setCompetitionProfile({ drawDefinition, competitionProfile: profile }).success).toBe(true);
    expect(drawDefinition.competitionProfile).toEqual(profile);
    expect(drawDefinition.extensions).toBeUndefined();
    expect(drawDefinition.updatedAt).toBeDefined();
    expect(getPayloads({ topic: MODIFY_DRAW_DEFINITION })).toHaveLength(1);
    profile.pairing.seed = 99;
    const queried = getCompetitionProfile({ drawDefinition });
    expect(queried.competitionProfile).toEqual(mexicano);
    if (queried.competitionProfile?.format === 'MEXICANO') queried.competitionProfile.pairing.seed = 100;
    expect(drawDefinition.competitionProfile).toEqual(mexicano);
    expect(removeCompetitionProfile({ drawDefinition }).success).toBe(true);
    expect(getCompetitionProfile({ drawDefinition }).competitionProfile).toBeUndefined();
  });
});

describe('competition profile context and lifecycle guards', () => {
  it('reports missing draws', () => {
    expect(setCompetitionProfile({ competitionProfile: mexicano }).error).toBe(MISSING_DRAW_DEFINITION);
    expect(removeCompetitionProfile({}).error).toBe(MISSING_DRAW_DEFINITION);
    expect(getCompetitionProfile({}).error).toBe(MISSING_DRAW_DEFINITION);
  });

  it('rejects incompatible draw and event types without writes', () => {
    const drawDefinition = draw();
    const before = copy(drawDefinition);
    expect(setCompetitionProfile({ drawDefinition, competitionProfile: ladder }).error).toBe(INVALID_VALUES);
    expect(drawDefinition).toEqual(before);
    delete drawDefinition.matchUpType;
    expect(
      setCompetitionProfile({
        drawDefinition,
        competitionProfile: americano,
        event: { eventId: 'e', eventType: 'SINGLES' },
      }).error,
    ).toBe(INVALID_VALUES);
    expect(
      setCompetitionProfile({
        drawDefinition,
        competitionProfile: americano,
        event: { eventId: 'e', eventType: 'DOUBLES' },
      }).success,
    ).toBe(true);
  });

  it('accepts a ladder marker without changing policies or standing state', () => {
    const drawDefinition: DrawDefinition = { ...draw(), drawType: LADDER };
    expect(setCompetitionProfile({ drawDefinition, competitionProfile: ladder }).success).toBe(true);
    expect(drawDefinition.competitionProfile).toEqual(ladder);
    expect(drawDefinition.structures).toEqual([]);
  });

  it.each(['draw', 'structure', 'nested'])('locks profile changes after %s matchUps exist', (location) => {
    const drawDefinition = draw();
    setCompetitionProfile({ drawDefinition, competitionProfile: mexicano });
    const matchUps = [{ matchUpId: 'm' }];
    if (location === 'draw') drawDefinition.matchUps = matchUps;
    else if (location === 'structure') drawDefinition.structures = [{ structureId: 's', matchUps }];
    else
      drawDefinition.structures = [
        { structureId: 's', structureType: 'CONTAINER', structures: [{ structureId: 'child', matchUps }] },
      ];
    const before = copy(drawDefinition);
    const changed = copy(mexicano);
    changed.pairing.seed = 99;
    expect(setCompetitionProfile({ drawDefinition, competitionProfile: changed }).error).toBe(EXISTING_MATCHUPS);
    expect(removeCompetitionProfile({ drawDefinition }).error).toBe(EXISTING_MATCHUPS);
    expect(setCompetitionProfile({ drawDefinition, competitionProfile: copy(mexicano) }).success).toBe(true);
    expect(drawDefinition).toEqual(before);
  });

  it('refuses initial attachment to existing matches and permits absent removal', () => {
    const drawDefinition = draw();
    drawDefinition.matchUps = [{ matchUpId: 'm' }];
    expect(setCompetitionProfile({ drawDefinition, competitionProfile: mexicano }).error).toBe(EXISTING_MATCHUPS);
    expect(removeCompetitionProfile({ drawDefinition }).success).toBe(true);
  });

  it('resolves drawId through the engine and survives JSON save/reload', () => {
    const tournamentRecord: Tournament = {
      tournamentId: 'profile-tournament',
      events: [{ eventId: 'profile-event', eventType: 'DOUBLES', drawDefinitions: [draw()] }],
    };
    tournamentEngine.setState(tournamentRecord);
    expect(
      tournamentEngine.setCompetitionProfile({ drawId: 'profile-draw', competitionProfile: mexicano }).success,
    ).toBe(true);
    const serialized = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    const saved = JSON.parse(serialized);
    tournamentEngine.setState(saved);
    expect(tournamentEngine.getCompetitionProfile({ drawId: 'profile-draw' }).competitionProfile).toEqual(mexicano);
    expect(tournamentEngine.removeCompetitionProfile({ drawId: 'profile-draw' }).success).toBe(true);
  });
});

describe('competition profile mutation locks', () => {
  it.each(['draw', 'event', 'tournament'])('enforces a DRAWS lock at %s scope for set and remove', (level) => {
    tournamentEngine.setState({
      tournamentId: 'profile-tournament',
      events: [{ eventId: 'profile-event', eventType: 'DOUBLES', drawDefinitions: [draw()] }],
    });
    const drawId = 'profile-draw';
    expect(tournamentEngine.setCompetitionProfile({ drawId, competitionProfile: mexicano }).success).toBe(true);
    const scopeParams: { drawId?: string; eventId?: string } = {};
    if (level === 'draw') scopeParams.drawId = drawId;
    if (level === 'event') scopeParams.eventId = 'profile-event';
    const lock = tournamentEngine.addMutationLock({ ...scopeParams, scope: 'DRAWS', lockToken: 'profile-token' });
    expect(lock.success).toBe(true);
    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    expect(tournamentEngine.setCompetitionProfile({ drawId, competitionProfile: americano }).error).toEqual(
      MUTATION_LOCKED,
    );
    expect(tournamentEngine.removeCompetitionProfile({ drawId }).error).toEqual(MUTATION_LOCKED);
    expect(tournamentEngine.getCompetitionProfile({ drawId }).competitionProfile).toEqual(mexicano);
    expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
    expect(
      tournamentEngine.removeMutationLock({ ...scopeParams, lockId: lock.lockId, lockToken: 'profile-token' }).success,
    ).toBe(true);
    expect(tournamentEngine.setCompetitionProfile({ drawId, competitionProfile: americano }).success).toBe(true);
    expect(tournamentEngine.removeCompetitionProfile({ drawId }).success).toBe(true);
  });
});

describe('persisted policy-approved scoring choices', () => {
  it.each([
    { tieResolution: 'ALLOW' as const },
    { tieResolution: 'DECIDING_POINT' as const },
    { tieResolution: 'WIN_BY_MARGIN' as const, winningMargin: 2 },
  ])('saves and reloads %j with schema agreement', (selectedVariant) => {
    const profile = { ...mexicano, scoring: { combinedPointTotal: 32, selectedVariant } };
    expect(isCompetitionProfile(profile)).toBe(true);
    expect(validateSchema(profile)).toBe(true);
    const drawDefinition = draw();
    expect(setCompetitionProfile({ drawDefinition, competitionProfile: profile }).success).toBe(true);
    const saved = JSON.stringify(drawDefinition);
    const restored = JSON.parse(saved) as DrawDefinition;
    expect(getRotatingPartnerScoringContract({ drawDefinition: restored }).contract).toEqual({
      combinedPointTotal: 32,
      ...selectedVariant,
    });
  });

  it.each([
    { tieResolution: 'UNKNOWN' },
    { tieResolution: 'WIN_BY_MARGIN', winningMargin: 1 },
    { tieResolution: 'WIN_BY_MARGIN', winningMargin: 2.5 },
    { tieResolution: 'ALLOW', winningMargin: 2 },
    { tieResolution: 'ALLOW', extra: true },
  ])('rejects malformed persisted choices %j in both validators', (selectedVariant) => {
    const profile = { ...mexicano, scoring: { combinedPointTotal: 32, selectedVariant } };
    expect(isCompetitionProfile(profile)).toBe(false);
    expect(validateSchema(profile)).toBe(false);
  });

  it('persists the default and freezes its interpretation across policy edits', () => {
    const drawDefinition = draw();
    setCompetitionProfile({ drawDefinition, competitionProfile: mexicano });
    expect(getRotatingPartnerScoringContract({ drawDefinition }).error).toBe(INVALID_VALUES);
    expect(setRotatingPartnerScoring({ drawDefinition }).success).toBe(true);
    const before = JSON.stringify(drawDefinition);
    const contract = getRotatingPartnerScoringContract({ drawDefinition }).contract;
    drawDefinition.extensions = [
      {
        name: APPLIED_POLICIES,
        value: {
          scoring: {
            rotatingPartners: {
              MEXICANO: {
                defaultVariant: { tieResolution: 'DECIDING_POINT' },
                permittedVariants: [{ tieResolution: 'DECIDING_POINT' }],
              },
            },
          },
        },
      },
    ];
    expect(getRotatingPartnerScoringContract({ drawDefinition }).contract).toEqual(contract);
    const after = copy(drawDefinition);
    expect(setRotatingPartnerScoring({ drawDefinition }).success).toBe(true);
    expect(drawDefinition).toEqual(after);
    expect(JSON.parse(before).competitionProfile.scoring.selectedVariant).toEqual({ tieResolution: 'ALLOW' });
    contract!.tieResolution = 'DECIDING_POINT';
    expect(getRotatingPartnerScoringContract({ drawDefinition }).contract?.tieResolution).toBe('ALLOW');
  });

  it('refuses a policy-prohibited direct profile write without changing the draw', () => {
    const drawDefinition = draw();
    drawDefinition.extensions = [
      {
        name: APPLIED_POLICIES,
        value: {
          scoring: {
            rotatingPartners: {
              MEXICANO: { defaultVariant: { tieResolution: 'ALLOW' }, permittedVariants: [{ tieResolution: 'ALLOW' }] },
            },
          },
        },
      },
    ];
    const before = copy(drawDefinition);
    expect(
      setCompetitionProfile({
        drawDefinition,
        competitionProfile: {
          ...mexicano,
          scoring: { combinedPointTotal: 32, selectedVariant: { tieResolution: 'DECIDING_POINT' } },
        },
      }).error,
    ).toBe(INVALID_VALUES);
    expect(drawDefinition).toEqual(before);
  });

  it('locks changed choices after matchUps exist and supports engine DRAWS locks', () => {
    const drawDefinition = draw();
    drawDefinition.competitionProfile = copy(mexicano);
    tournamentEngine.setState({
      tournamentId: 'scoring-t',
      events: [{ eventId: 'scoring-e', drawDefinitions: [drawDefinition] }],
    });
    expect(tournamentEngine.setRotatingPartnerScoring({ drawId: drawDefinition.drawId }).success).toBe(true);
    expect(tournamentEngine.getRotatingPartnerScoringContract({ drawId: drawDefinition.drawId }).contract).toEqual({
      combinedPointTotal: 32,
      tieResolution: 'ALLOW',
    });
    expect(
      tournamentEngine.addMutationLock({ scope: 'DRAWS', drawId: drawDefinition.drawId, lockToken: 'scoring' }).success,
    ).toBe(true);
    expect(tournamentEngine.setRotatingPartnerScoring({ drawId: drawDefinition.drawId }).error).toBe(MUTATION_LOCKED);
    const loaded = copy(drawDefinition);
    loaded.matchUps = [{ matchUpId: 'played' }];
    expect(
      setRotatingPartnerScoring({ drawDefinition: loaded, selectedVariant: { tieResolution: 'DECIDING_POINT' } }).error,
    ).toBe(EXISTING_MATCHUPS);
  });
});

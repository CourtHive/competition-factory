import { POLICY_ROUND_ROBIN_TALLY_DEFAULT } from '@Fixtures/policies/POLICY_ROUND_ROBIN_TALLY_DEFAULT';
import POLICY_MATCHUP_ACTIONS_DEFAULT from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import POLICY_ROUND_NAMING_DEFAULT from '@Fixtures/policies/POLICY_ROUND_NAMING_DEFAULT';
import { POLICY_TYPE_LADDER, policyConstants } from '@Constants/policyConstants';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import ts from 'typescript';
import fs from 'fs-extra';
import Ajv from 'ajv';

/**
 * POLICY DEFINITIONS AGAINST THE SHAPES PRODUCTION STORES.
 *
 * A read-only census of every applied policy in production (2026-11-02; key paths and counts only, recorded in the
 * CODES policy definitions design note) found six policy types stored: seeding, scheduling, roundRobinTally,
 * roundNaming, matchUpActions and avoidance. Each policy below carries every key path the census found for its type,
 * with values of the kind the factory writes, so a definition that would reject a stored shape fails here.
 */

const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }));
const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema, 'codes');
const validatePolicies = ajv.getSchema('codes#/definitions/PolicyDefinitions')!;

function errorsOf(value: any): string | undefined {
  return validatePolicies(value) ? undefined : ajv.errorsText(validatePolicies.errors);
}

/** Every census key path, per policy type, as a policy holding it. */
const CENSUS_SHAPED: Record<string, any> = {
  seeding: {
    policyName: 'SEEDING',
    drawSizeProgression: true,
    duplicateSeedNumbers: true,
    validSeedPositions: { ignore: true },
    seedingProfile: {
      positioning: 'SEPARATE',
      drawTypes: { ROUND_ROBIN: { positioning: 'WATERFALL' }, ROUND_ROBIN_WITH_PLAYOFF: { positioning: 'WATERFALL' } },
    },
    seedsCountThresholds: [{ drawSize: 4, minimumParticipantCount: 3, seedsCount: 2 }],
  },
  scheduling: {
    defaultDailyLimits: { SINGLES: 2, DOUBLES: 2, total: 3 },
    defaultTimes: {
      averageTimes: [{ categoryNames: [], minutes: { default: 90 } }],
      recoveryTimes: [{ minutes: { DOUBLES: 30, default: 60 } }],
    },
    matchUpAverageTimes: [
      {
        matchUpFormatCodes: ['SET3-S:6/TB7'],
        averageTimes: [
          { categoryNames: [], minutes: { default: 90 } },
          { categoryTypes: ['WHEELCHAIR'], minutes: { default: 120 } },
        ],
      },
    ],
    matchUpRecoveryTimes: [
      {
        matchUpFormatCodes: ['SET3-S:6/TB7'],
        recoveryTimes: [
          { categoryTypes: ['ADULT', 'WHEELCHAIR'], minutes: { default: 60, DOUBLES: 30 } },
          { categoryNames: [], minutes: { default: 30 } },
        ],
      },
    ],
    matchUpDailyLimits: [],
  },
  roundRobinTally: {
    policyName: 'Default Round Robin Tally',
    groupOrderKey: 'matchUpsWon',
    headToHead: { disabled: false },
    GEMscore: ['matchUpsPct', 'tieMatchUpsPct', 'setsPct', 'gamesPct', 'pointsPct'],
    excludeMatchUpStatuses: [],
    disqualifyDefaults: true,
    disqualifyWalkovers: true,
    gamesCreditForDefaults: false,
    gamesCreditForRetirements: false,
    gamesCreditForTiebreakSets: true,
    gamesCreditForWalkovers: false,
    setsCreditForDefaults: false,
    setsCreditForRetirements: false,
    setsCreditForWalkovers: false,
    groupTotalGamesPlayed: false,
    groupTotalSetsPlayed: false,
    tallyDirectives: [
      { attribute: 'matchUpsPct', idsFilter: true },
      { attribute: 'setsPct', idsFilter: true, groupTotals: true },
      { attribute: 'gamesPct', idsFilter: false, reversed: true },
    ],
  },
  roundNaming: {
    policyName: 'Round Naming Default',
    affixes: { preFeedRound: 'Q', roundNumber: 'R' },
    roundNamingMap: { 1: 'Final', 2: 'Semifinal', 4: 'Quarterfinal' },
    stageConstants: { MAIN: '', QUALIFYING: 'Q', CONSOLATION: 'C', PLAY_OFF: 'P' },
  },
  matchUpActions: {
    policyName: 'matchUpActionsDefault',
    enabledStructures: [{ stages: [], stageSequences: [], enabledActions: [], disabledActions: [] }],
    participants: { enforceGender: true },
    processCodes: { substitution: ['RANKING.IGNORE', 'RATING.IGNORE'] },
  },
  avoidance: {
    policyAttributes: [{ key: 'person.nationalityCode' }, { directive: 'pairParticipants' }],
  },
};

describe('production policy shapes validate', () => {
  it.each(Object.keys(CENSUS_SHAPED))('a %s policy holding every key path the census found', (policyType) => {
    expect(errorsOf({ [policyType]: CENSUS_SHAPED[policyType] })).toBeUndefined();
  });

  it('a seeding policy holding only validSeedPositions (197 stored)', () => {
    expect(errorsOf({ seeding: { validSeedPositions: { ignore: true } } })).toBeUndefined();
  });

  it('the bundled round naming, matchUp actions and tally fixtures', () => {
    expect(errorsOf(POLICY_ROUND_NAMING_DEFAULT)).toBeUndefined();
    expect(errorsOf(POLICY_MATCHUP_ACTIONS_DEFAULT)).toBeUndefined();
    expect(errorsOf(POLICY_ROUND_ROBIN_TALLY_DEFAULT)).toBeUndefined();
  });
});

describe('the newly modelled policies are closed where their readers are known', () => {
  it.each([
    ['roundNaming', { roundNamingMap: { 1: 7 } }], // names are strings
    ['roundNaming', { affixes: { roundNumber: 'R', unknownAffix: 'X' } }],
    ['roundNaming', { roundNamingTypo: {} }],
    ['matchUpActions', { enabledStructures: [{ stages: [], unknownFilter: [] }] }],
    ['matchUpActions', { participants: { enforceGender: 'yes' } }],
    ['avoidance', { policyAttributes: [{ key: 'person.nationalityCode', weight: 2 }] }],
    ['avoidance', { roundsToSeparate: 'two' }],
    ['roundRobinTally', { tallyDirectives: [{ idsFilter: true }] }], // a directive names its attribute
    ['roundRobinTally', { drawCredit: 2 }],
    ['roundRobinTally', { precision: -1 }],
  ])('rejects %s %j', (policyType, policy) => {
    expect(validatePolicies({ [policyType]: policy })).toEqual(false);
  });

  it('the tally policy is open by decision: an extension member validates', () => {
    expect(errorsOf({ roundRobinTally: { ...CENSUS_SHAPED.roundRobinTally, aFutureOption: true } })).toBeUndefined();
    expect(schema.definitions.RoundRobinTallyPolicy.$comment).toContain('OPEN');
  });
});

describe('ladder is a policy type the factory defines', () => {
  it('is in policyConstants, and in PolicyDefinitions', () => {
    expect(Object.values(policyConstants)).toContain(POLICY_TYPE_LADDER);
    expect(schema.definitions.PolicyDefinitions.properties[POLICY_TYPE_LADDER]).toBeDefined();
  });
});

describe('the newly modelled definitions match their TypeScript types', () => {
  const PAIRS: [file: string, typeName: string, definitionName: string, open?: boolean][] = [
    ['./src/types/factoryTypes.ts', 'RoundNamingPolicy', 'RoundNamingPolicy'],
    ['./src/query/drawDefinition/positionActions/actionPolicyUtils.ts', 'MatchUpActionsPolicy', 'MatchUpActionsPolicy'],
    [
      './src/query/drawDefinition/positionActions/actionPolicyUtils.ts',
      'ActionsStructurePolicy',
      'ActionsStructurePolicy',
    ],
    ['./src/mutate/drawDefinitions/positionGovernor/randomUnseededSeparation.ts', 'AvoidancePolicy', 'AvoidancePolicy'],
    [
      './src/mutate/drawDefinitions/positionGovernor/randomUnseededSeparation.ts',
      'PolicyAttribute',
      'AvoidancePolicyAttribute',
    ],
    ['./src/types/roundRobinTallyPolicy.ts', 'RoundRobinTallyPolicy', 'RoundRobinTallyPolicy', true],
  ];
  const program = ts.createProgram([...new Set(PAIRS.map(([file]) => file))], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: '.',
    paths: JSON.parse(fs.readFileSync('./tsconfig.json', { encoding: 'utf8' }).replace(/\/\/.*$/gm, '')).compilerOptions
      ?.paths,
  });
  const checker = program.getTypeChecker();

  function typedProperties(file: string, typeName: string): string[] | undefined {
    let properties: string[] | undefined;
    program.getSourceFile(file)?.forEachChild((node) => {
      if ((ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.name.text === typeName) {
        properties = checker.getPropertiesOfType(checker.getTypeAtLocation(node.name)).map(({ name }) => name);
      }
    });
    return properties?.toSorted((a, b) => a.localeCompare(b, 'en'));
  }

  it.each(PAIRS)('%s %s and #/definitions/%s', (file, typeName, definitionName, open) => {
    const typed = typedProperties(file, typeName);
    // CONTROL: the type was found and has members, so the comparison is not vacuous
    expect(typed?.length).toBeGreaterThan(0);
    const declared = Object.keys(schema.definitions[definitionName].properties).toSorted((a, b) =>
      a.localeCompare(b, 'en'),
    );
    if (open) {
      // an open definition lists at least every member its type declares
      expect(typed?.filter((property) => !declared.includes(property))).toEqual([]);
      expect(schema.definitions[definitionName].additionalProperties).toEqual(true);
    } else {
      expect(declared).toEqual(typed);
      expect(schema.definitions[definitionName].additionalProperties).toEqual(false);
    }
  });
});

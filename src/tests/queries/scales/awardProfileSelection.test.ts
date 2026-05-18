import { getAwardProfile } from '@Query/scales/getAwardProfile';
import { POLICY_RANKING_POINTS_USTA_JUNIOR } from '@Fixtures/policies/POLICY_RANKING_POINTS_USTA_JUNIOR';
import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { describe, expect, it, afterEach } from 'vitest';

import { SINGLES } from '@Constants/eventConstants';
import { COMPASS, ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';

describe('CategoryScope gender matching', () => {
  it('selects profile matching gender when two profiles differ only by category.genders', () => {
    const baseProfile = {
      profileName: 'Default',
      drawTypes: [SINGLE_ELIMINATION],
      levels: [1, 2, 3],
      finishingPositionRanges: {
        1: { level: { 1: 100, 2: 80, 3: 60 } },
        2: { level: { 1: 70, 2: 56, 3: 42 } },
      },
    };

    const maleProfile = {
      ...baseProfile,
      profileName: 'Male Only',
      category: { genders: [MALE] },
      finishingPositionRanges: {
        1: { level: { 1: 200, 2: 160, 3: 120 } },
        2: { level: { 1: 140, 2: 112, 3: 84 } },
      },
    };

    const femaleProfile = {
      ...baseProfile,
      profileName: 'Female Only',
      category: { genders: [FEMALE] },
      finishingPositionRanges: {
        1: { level: { 1: 150, 2: 120, 3: 90 } },
        2: { level: { 1: 105, 2: 84, 3: 63 } },
      },
    };

    const awardProfiles = [baseProfile, maleProfile, femaleProfile];

    // Male gender should select male profile
    const { awardProfile: maleResult } = getAwardProfile({
      awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      gender: MALE,
      level: 2,
      participation: { participationOrder: 1, flightNumber: 1 },
    });
    expect(maleResult?.profileName).toEqual('Male Only');

    // Female gender should select female profile
    const { awardProfile: femaleResult } = getAwardProfile({
      awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      gender: FEMALE,
      level: 2,
      participation: { participationOrder: 1, flightNumber: 1 },
    });
    expect(femaleResult?.profileName).toEqual('Female Only');

    // No gender should select default (no category constraint)
    const { awardProfile: defaultResult } = getAwardProfile({
      awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      level: 2,
      participation: { participationOrder: 1, flightNumber: 1 },
    });
    // Default matches, male matches (gender undefined not in [MALE]), female matches (gender undefined not in [FEMALE])
    // Actually: category.genders check: profileCategory.genders.includes(undefined) → false → blocked
    // So only default matches when gender is undefined
    expect(defaultResult?.profileName).toEqual('Default');
  });
});

describe('CategoryScope ageCategoryCode matching', () => {
  it('selects profile matching ageCategoryCode when two profiles differ only by category.ageCategoryCodes', () => {
    const u14Profile = {
      profileName: 'Under 14',
      drawTypes: [SINGLE_ELIMINATION],
      levels: [1, 2, 3],
      category: { ageCategoryCodes: ['U14'] },
      finishingPositionRanges: {
        1: { level: { 1: 300, 2: 200, 3: 100 } },
      },
    };

    const u18Profile = {
      profileName: 'Under 18',
      drawTypes: [SINGLE_ELIMINATION],
      levels: [1, 2, 3],
      category: { ageCategoryCodes: ['U18'] },
      finishingPositionRanges: {
        1: { level: { 1: 500, 2: 350, 3: 200 } },
      },
    };

    const catchAllProfile = {
      profileName: 'All Ages',
      drawTypes: [SINGLE_ELIMINATION],
      levels: [1, 2, 3],
      finishingPositionRanges: {
        1: { level: { 1: 100, 2: 70, 3: 40 } },
      },
    };

    const awardProfiles = [catchAllProfile, u14Profile, u18Profile];

    // U14 category matches U14 profile
    const { awardProfile: u14Result } = getAwardProfile({
      awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      category: { ageCategoryCode: 'U14' },
      level: 2,
      participation: { participationOrder: 1, flightNumber: 1 },
    });
    expect(u14Result?.profileName).toEqual('Under 14');

    // U18 category matches U18 profile
    const { awardProfile: u18Result } = getAwardProfile({
      awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      category: { ageCategoryCode: 'U18' },
      level: 2,
      participation: { participationOrder: 1, flightNumber: 1 },
    });
    expect(u18Result?.profileName).toEqual('Under 18');

    // No category → only catch-all matches
    const { awardProfile: defaultResult } = getAwardProfile({
      awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      level: 2,
      participation: { participationOrder: 1, flightNumber: 1 },
    });
    expect(defaultResult?.profileName).toEqual('All Ages');
  });
});

describe('Specificity scoring', () => {
  it('more constrained profile wins over catch-all', () => {
    const catchAll = {
      profileName: 'Catch All',
      levels: [1, 2, 3, 4, 5],
      perWinPoints: { level: { 1: 10, 2: 8, 3: 6, 4: 4, 5: 2 } },
    };

    const specific = {
      profileName: 'Specific RR',
      drawTypes: [ROUND_ROBIN],
      levels: [3, 4, 5],
      perWinPoints: { level: { 3: 75, 4: 50, 5: 25 } },
    };

    const awardProfiles = [catchAll, specific];

    // For a ROUND_ROBIN at level 4 — both match, but specific has higher specificity
    // catchAll: levels(1) = score 1
    // specific: drawTypes(1) + levels(1) = score 2
    const { awardProfile } = getAwardProfile({
      awardProfiles,
      drawType: ROUND_ROBIN,
      level: 4,
      participation: { participationOrder: 1, flightNumber: 1 },
    });
    expect(awardProfile?.profileName).toEqual('Specific RR');
  });

  it('catch-all is used when specific profile does not match', () => {
    const catchAll = {
      profileName: 'Catch All',
      levels: [1, 2, 3, 4, 5],
      perWinPoints: { level: { 1: 10, 2: 8, 3: 6, 4: 4, 5: 2 } },
    };

    const specific = {
      profileName: 'Specific RR',
      drawTypes: [ROUND_ROBIN],
      levels: [3, 4, 5],
      perWinPoints: { level: { 3: 75, 4: 50, 5: 25 } },
    };

    const awardProfiles = [catchAll, specific];

    // For a COMPASS at level 2 — only catchAll matches (wrong drawType + level for specific)
    const { awardProfile } = getAwardProfile({
      awardProfiles,
      drawType: COMPASS,
      level: 2,
      participation: { participationOrder: 1, flightNumber: 1 },
    });
    expect(awardProfile?.profileName).toEqual('Catch All');
  });
});

describe('Priority override', () => {
  it('explicit priority overrides specificity scoring', () => {
    const highSpecificity = {
      profileName: 'High Specificity',
      drawTypes: [SINGLE_ELIMINATION],
      levels: [1, 2, 3],
      eventTypes: [SINGLES],
      perWinPoints: { level: { 1: 50, 2: 40, 3: 30 } },
      // specificity score: drawTypes(1) + levels(1) + eventTypes(1) = 3
    };

    const lowSpecificityHighPriority = {
      profileName: 'Priority Override',
      levels: [1, 2, 3],
      priority: 10,
      perWinPoints: { level: { 1: 100, 2: 80, 3: 60 } },
      // specificity score: levels(1) = 1, but priority = 10
    };

    const awardProfiles = [highSpecificity, lowSpecificityHighPriority];

    // Both match for SINGLE_ELIMINATION / SINGLES / level 2
    // highSpecificity has score 3, lowSpecificityHighPriority has score 1
    // But lowSpecificityHighPriority has priority=10, which overrides specificity
    const { awardProfile } = getAwardProfile({
      awardProfiles,
      drawType: SINGLE_ELIMINATION,
      eventType: SINGLES,
      level: 2,
      participation: { participationOrder: 1, flightNumber: 1 },
    });
    expect(awardProfile?.profileName).toEqual('Priority Override');
  });

  it('highest priority wins among multiple prioritized profiles', () => {
    const lowPriority = {
      profileName: 'Low Priority',
      levels: [1, 2, 3],
      priority: 1,
      perWinPoints: { level: { 1: 10 } },
    };

    const highPriority = {
      profileName: 'High Priority',
      levels: [1, 2, 3],
      priority: 5,
      perWinPoints: { level: { 1: 50 } },
    };

    const awardProfiles = [lowPriority, highPriority];

    const { awardProfile } = getAwardProfile({
      awardProfiles,
      level: 2,
      participation: { participationOrder: 1, flightNumber: 1 },
    });
    expect(awardProfile?.profileName).toEqual('High Priority');
  });

  it('tied priority falls back to array order (first wins)', () => {
    const firstTied = {
      profileName: 'First Tied',
      levels: [1, 2, 3],
      priority: 5,
      perWinPoints: { level: { 1: 10 } },
    };

    const secondTied = {
      profileName: 'Second Tied',
      levels: [1, 2, 3],
      priority: 5,
      perWinPoints: { level: { 1: 50 } },
    };

    const awardProfiles = [firstTied, secondTied];

    const { awardProfile } = getAwardProfile({
      awardProfiles,
      level: 2,
      participation: { participationOrder: 1, flightNumber: 1 },
    });
    expect(awardProfile?.profileName).toEqual('First Tied');
  });
});

describe('profileName in output', () => {
  afterEach(() => {
    scaleEngine.devContext(false);
  });

  it('profileName appears in award when devContext is active', () => {
    const policyDefinitions = POLICY_RANKING_POINTS_USTA_JUNIOR;

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: COMPASS, drawSize: 16 }],
      completeAllMatchUps: true,
      setState: true,
    });

    // Enable devContext
    scaleEngine.devContext(true);

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 3 });
    expect(result.success).toEqual(true);

    const allAwards = Object.values(result.personPoints).flat() as any[];
    expect(allAwards.length).toBeGreaterThan(0);

    // When devContext is active, profileName should be present
    const withProfileName = allAwards.filter((a) => a.profileName);
    expect(withProfileName.length).toBeGreaterThan(0);
    expect(withProfileName[0].profileName).toEqual('Elimination L1-5');
  });

  it('profileName is absent when devContext is not active', () => {
    const policyDefinitions = POLICY_RANKING_POINTS_USTA_JUNIOR;

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: COMPASS, drawSize: 16 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 3 });
    expect(result.success).toEqual(true);

    const allAwards = Object.values(result.personPoints).flat() as any[];
    expect(allAwards.length).toBeGreaterThan(0);

    // Without devContext, profileName should not be present
    const withProfileName = allAwards.filter((a) => a.profileName);
    expect(withProfileName.length).toEqual(0);
  });
});

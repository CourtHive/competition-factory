import { catalogueEntries, entryVersions, policies, provenance } from '../src';
import { describe, expect, it } from 'vitest';

// The policyVersion each federation template carries. Hosts store a template under its name and this version, so a
// change to either is a new template version, not an edit.
const FEDERATION_VERSIONS: Record<string, string> = {
  TEMPLATE_RANKING_POINTS_CTS: '2025.01',
  TEMPLATE_RANKING_POINTS_LTA: '2020.04',
  TEMPLATE_RANKING_POINTS_TENNIS_AUSTRALIA: '2025.01',
  TEMPLATE_RANKING_POINTS_TENNIS_CANADA: '2025.01',
  TEMPLATE_RANKING_POINTS_TENNIS_EUROPE: '2026.01',
  TEMPLATE_RANKING_POINTS_USTA_JUNIOR_2025: '2025.01',
  TEMPLATE_RANKING_POINTS_USTA_JUNIOR_2026: '2026.01',
};

// the AwardProfile fields that award points; a profile carries at least one
const POINT_SOURCES = ['finishingPositionRanges', 'perWinPoints', 'tieWinPoints', 'groupOrderPoints', 'bonusPoints'];

const rankingPointsNames = Object.keys(policies).filter((name) => name.startsWith('TEMPLATE_RANKING_POINTS_'));

describe('ranking-points templates', () => {
  it('publishes the twelve, the seven federation templates among them', () => {
    expect(rankingPointsNames).toHaveLength(12);
    for (const name of Object.keys(FEDERATION_VERSIONS)) expect(rankingPointsNames, name).toContain(name);
  });

  it.each(rankingPointsNames)('%s loads with the shape of a ranking-points policy', (name) => {
    const definition = (policies as Record<string, any>)[name];
    expect(Object.keys(definition)).toEqual(['rankingPoints']);
    const policy = definition.rankingPoints;
    expect(typeof policy.policyName).toEqual('string');
    expect(policy.policyVersion).toMatch(/^\d{4}\.\d{2}$/);
    expect(policy.awardProfiles.length).toBeGreaterThan(0);
    for (const profile of policy.awardProfiles) {
      expect(typeof profile.profileName).toEqual('string');
      expect(
        POINT_SOURCES.some((key) => profile[key] !== undefined),
        `${name} ${profile.profileName}`,
      ).toEqual(true);
    }
    expect(policy.aggregationRules).toBeTypeOf('object');
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
  });

  it.each(Object.entries(FEDERATION_VERSIONS))('%s is version %s, a template entry at 1.0.0', (name, version) => {
    expect((policies as Record<string, any>)[name].rankingPoints.policyVersion).toEqual(version);
    expect(entryVersions[name]).toEqual('1.0.0');
    const entry = catalogueEntries.find((candidate) => candidate.name === name);
    expect(entry?.kind).toEqual('policy');
    expect(entry?.provenance).toEqual(provenance[name]);
    expect(entry?.provenance).toMatchObject({ status: 'template', maintained: false, endorsed: false });
  });
});

describe('every catalogue entry', () => {
  it.each(catalogueEntries.map((entry) => [entry.name, entry] as const))('%s is plain data', (_, entry) => {
    expect(JSON.parse(JSON.stringify(entry.definition))).toEqual(entry.definition);
  });
});

// Regression cover: `PointAward.category.gender` must be populated.
//
// THE DEFECT THIS REPLACES. The award's category snapshot was assigned
// `category: event?.category` verbatim. Gender lives on the EVENT, beside
// `category` rather than inside it — `resolveScope` in
// getApplicableAwardProfileLevels reads `event?.gender` for award-profile
// selection — so it never reached the award. `PointAward.category.gender` was
// declared in `rankingTypes.ts` and populated by nothing.
//
// It was invisible from inside this repository. The consumer read exactly the
// documented field and correctly got `undefined`; nothing here was red. It
// surfaced only downstream, in production: `courthive-rankings.point_awards`
// held 3,552 rows with `gender` NULL, and every gendered ranking list generated
// from them came out with `entry_count = 0`, because `WHERE gender = 'MALE'`
// never matches a NULL. `ranking_entries` held zero rows.
//
// The case that matters most is an event with a GENDER AND NO CATEGORY OBJECT —
// 123 of the 129 events in that corpus. Merging into a category that does not
// exist is the version of this fix that still produces `undefined`.

import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { describe, expect, it } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { ANY, FEMALE, MALE } from '@Constants/genderConstants';
import { SINGLES } from '@Constants/eventConstants';

const simplePolicy = {
  [POLICY_TYPE_RANKING_POINTS]: {
    awardProfiles: [
      {
        profileName: 'Standard SE',
        drawTypes: [SINGLE_ELIMINATION],
        finishingPositionRanges: {
          1: { level: { 1: 1000 } },
          2: { level: { 1: 700 } },
          4: { level: { 1: 400 } },
          8: { level: { 1: 200 } },
        },
      },
    ],
  },
};

function awardsForEvent(overrides: Record<string, any>) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, eventType: SINGLES, ...overrides }],
    completeAllMatchUps: true,
    setState: true,
  });

  const result = scaleEngine.getTournamentPointAwards({
    policyDefinitions: simplePolicy,
    level: 1,
  });

  expect(result.success).toEqual(true);
  expect(tournamentRecord).toBeDefined();
  return result.pointAwards;
}

describe('PointAward.category.gender', () => {
  it('carries the event gender when the event has NO category object', () => {
    // The production shape: gender declared on the event, no category at all.
    // This is the assertion that fails without the fix — `category` was
    // `undefined`, so `category?.gender` was too.
    const awards = awardsForEvent({ gender: MALE });

    expect(awards.length).toBeGreaterThan(0);
    for (const award of awards) {
      expect(award.category?.gender).toEqual(MALE);
    }
  });

  it('carries FEMALE the same way', () => {
    const awards = awardsForEvent({ gender: FEMALE });

    expect(awards.length).toBeGreaterThan(0);
    for (const award of awards) {
      expect(award.category?.gender).toEqual(FEMALE);
    }
  });

  it('records ANY as the event declares it, rather than deciding a list for it', () => {
    // 10 events in the production corpus are ANY. Whether an ANY event counts
    // toward a gendered ranking list is an AGGREGATION POLICY question and is
    // deliberately not answered by the engine. Recording the value faithfully
    // is what makes that choice expressible downstream without re-deriving
    // every award — and a gendered list that filters `= 'MALE'` still excludes
    // it, which is the conservative default.
    const awards = awardsForEvent({ gender: ANY });

    expect(awards.length).toBeGreaterThan(0);
    for (const award of awards) {
      expect(award.category?.gender).toEqual(ANY);
    }
  });

  it('preserves an explicit category.gender over the event gender', () => {
    // An event that states both is taken at its narrower word: the category is
    // the more specific statement.
    const awards = awardsForEvent({
      gender: ANY,
      category: { categoryName: 'U18', ageCategoryCode: 'U18', gender: FEMALE },
    });

    expect(awards.length).toBeGreaterThan(0);
    for (const award of awards) {
      expect(award.category?.gender).toEqual(FEMALE);
      // and the rest of the snapshot survives untouched
      expect(award.category?.ageCategoryCode).toEqual('U18');
    }
  });

  it('merges gender into an existing category without dropping its other fields', () => {
    const awards = awardsForEvent({
      gender: MALE,
      category: { categoryName: 'U16', ageCategoryCode: 'U16' },
    });

    expect(awards.length).toBeGreaterThan(0);
    for (const award of awards) {
      expect(award.category?.gender).toEqual(MALE);
      expect(award.category?.ageCategoryCode).toEqual('U16');
      expect(award.category?.categoryName).toEqual('U16');
    }
  });

  it('leaves category undefined when the event declares neither', () => {
    // Not every event has a gender. Inventing a category object for an event
    // that says nothing about one would assert a fact that does not exist.
    const awards = awardsForEvent({});

    expect(awards.length).toBeGreaterThan(0);
    for (const award of awards) {
      expect(award.category?.gender).toBeUndefined();
    }
  });
});

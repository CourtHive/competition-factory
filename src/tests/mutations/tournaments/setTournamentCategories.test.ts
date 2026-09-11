import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { TOURNAMENT_CATEGORY_IN_USE } from '@Constants/errorConditionConstants';

function seed(overrides?: any) {
  return mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, ...overrides }],
    setState: true,
  });
}

describe('setTournamentCategories', () => {
  it('persists a category set when nothing references the removed entries', () => {
    seed();
    let result: any = tournamentEngine.setTournamentCategories({
      categories: [
        { categoryName: 'U18', type: 'AGE', ageCategoryCode: 'U18' },
        { categoryName: 'Open', type: 'AGE' },
      ],
    });
    expect(result.success).toBe(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentCategories).toHaveLength(2);
  });

  it('filters entries missing categoryName or type', () => {
    seed();
    let result: any = tournamentEngine.setTournamentCategories({
      categories: [
        { categoryName: 'U18', type: 'AGE' },
        { type: 'AGE' }, // missing categoryName
        { categoryName: 'NoType' }, // missing type
      ],
    });
    expect(result.success).toBe(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(tournamentRecord.tournamentCategories).toHaveLength(1);
    expect(tournamentRecord.tournamentCategories[0].categoryName).toBe('U18');
  });

  it('rejects a removal that orphans an event.category by ageCategoryCode', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
    tournamentRecord.events[0].category = { ageCategoryCode: 'U18' };
    tournamentRecord.tournamentCategories = [{ categoryName: 'U18', type: 'AGE', ageCategoryCode: 'U18' }];
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.setTournamentCategories({
      categories: [{ categoryName: 'U16', type: 'AGE', ageCategoryCode: 'U16' }],
    });
    expect(result.error).toEqual(TOURNAMENT_CATEGORY_IN_USE);
    expect(result.referenced).toContain('U18');

    const after = tournamentEngine.getTournament().tournamentRecord;
    expect(after.tournamentCategories[0].ageCategoryCode).toBe('U18');
  });

  it('rejects a removal that orphans by categoryName', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
    tournamentRecord.events[0].category = { categoryName: 'Foobar' };
    tournamentRecord.tournamentCategories = [{ categoryName: 'Foobar', type: 'RATING' }];
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.setTournamentCategories({
      categories: [{ categoryName: 'Other', type: 'AGE' }],
    });
    expect(result.error).toEqual(TOURNAMENT_CATEGORY_IN_USE);
    expect(result.referenced).toContain('Foobar');
  });

  it('allows the removal when the event reference is preserved under the new set', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
    tournamentRecord.events[0].category = { ageCategoryCode: 'U18' };
    tournamentRecord.tournamentCategories = [
      { categoryName: 'U18', type: 'AGE', ageCategoryCode: 'U18' },
      { categoryName: 'U16', type: 'AGE', ageCategoryCode: 'U16' },
    ];
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.setTournamentCategories({
      categories: [{ categoryName: 'U18', type: 'AGE', ageCategoryCode: 'U18' }],
    });
    expect(result.success).toBe(true);

    const after = tournamentEngine.getTournament().tournamentRecord;
    expect(after.tournamentCategories).toHaveLength(1);
  });

  it('passes when the tournament has no events', () => {
    mocksEngine.generateTournamentRecord({ setState: true });

    let result: any = tournamentEngine.setTournamentCategories({
      categories: [],
    });
    expect(result.success).toBe(true);
  });

  it('passes when no event has a category assigned', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
    delete tournamentRecord.events[0].category;
    tournamentRecord.tournamentCategories = [{ categoryName: 'U18', type: 'AGE', ageCategoryCode: 'U18' }];
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.setTournamentCategories({ categories: [] });
    expect(result.success).toBe(true);
  });

  it('collects multiple orphaned references across events', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
    tournamentRecord.events.push({
      ...tournamentRecord.events[0],
      eventId: 'e2',
      category: { ageCategoryCode: 'U16' },
    });
    tournamentRecord.events[0].category = { ageCategoryCode: 'U18' };
    tournamentRecord.tournamentCategories = [
      { categoryName: 'U18', type: 'AGE', ageCategoryCode: 'U18' },
      { categoryName: 'U16', type: 'AGE', ageCategoryCode: 'U16' },
    ];
    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.setTournamentCategories({ categories: [] });
    expect(result.error).toEqual(TOURNAMENT_CATEGORY_IN_USE);
    expect(result.referenced).toEqual(expect.arrayContaining(['U18', 'U16']));
  });
});

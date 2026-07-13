import { getTournamentCalendarEntry } from '@Query/tournaments/getTournamentCalendarEntry';
import { mocksEngine } from '@Assemblies/engines/mock';
import { expect, test, describe } from 'vitest';

describe('getTournamentCalendarEntry', () => {
  const build = (onlineResources?: any[]) => {
    const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 'cal-1' },
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentRecord.tournamentName = 'Spring Open';
    tournamentRecord.startDate = '2026-05-10';
    tournamentRecord.endDate = '2026-05-12';
    tournamentRecord.parentOrganisation = { organisationId: 'prov-1' };
    if (onlineResources) tournamentRecord.onlineResources = onlineResources;
    return tournamentRecord;
  };

  test('derives the core lightweight entry fields', () => {
    let result: any = getTournamentCalendarEntry({ tournamentRecord: build() });
    expect(result.tournamentId).toBe('cal-1');
    expect(result.providerId).toBe('prov-1');
    expect(result.searchText).toBe('spring open');
    expect(result.tournament.tournamentName).toBe('Spring Open');
    expect(result.tournament.startDate).toBe('2026-05-10');
    expect(result.tournament.endDate).toBe('2026-05-12');
  });

  test('flattens a URL tournamentImage into tournamentImageURL', () => {
    const record = build([
      { name: 'tournamentImage', resourceType: 'URL', resourceSubType: 'IMAGE', identifier: 'https://cdn/x.png' },
    ]);
    let result: any = getTournamentCalendarEntry({ tournamentRecord: record });
    expect(result.tournament.tournamentImageURL).toBe('https://cdn/x.png');
  });

  test('ships onlineResources so a court-SVG (non-URL) image survives for downstream extraction', () => {
    const courtSvg = {
      name: 'tournamentImage',
      resourceType: 'OTHER',
      resourceSubType: 'COURT_SVG',
      identifier: 'tennis',
    };
    let result: any = getTournamentCalendarEntry({ tournamentRecord: build([courtSvg]) });
    // Not flattened to tournamentImageURL (it is not a URL) ...
    expect(result.tournament.tournamentImageURL).toBeUndefined();
    // ... but present in onlineResources so the card's court-SVG extractor works.
    expect(result.tournament.onlineResources).toContainEqual(courtSvg);
  });

  test('omits server-only createdByUserId (stays a factory-pure entry)', () => {
    const record = build();
    record.extensions = [{ name: 'createdByUserId', value: 'user-123' }];
    let result: any = getTournamentCalendarEntry({ tournamentRecord: record });
    expect(result).not.toHaveProperty('createdByUserId');
  });

  test('guards missing dates instead of throwing on new Date(undefined)', () => {
    const record = build();
    delete record.startDate;
    delete record.endDate;
    let result: any = getTournamentCalendarEntry({ tournamentRecord: record });
    expect(result.tournament.startDate).toBeUndefined();
    expect(result.tournament.endDate).toBeUndefined();
  });
});

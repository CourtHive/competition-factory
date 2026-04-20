import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe, beforeEach } from 'vitest';

describe('registrationProfile', () => {
  beforeEach(() => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      setState: true,
    });
  });

  it('sets basic registration profile fields', () => {
    let result: any = tournamentEngine.setRegistrationProfile({
      registrationProfile: {
        entriesOpen: '2026-05-01',
        entriesClose: '2026-05-15',
        withdrawalDeadline: '2026-05-20',
        entryMethod: 'ONLINE',
        entryUrl: 'https://example.com/enter',
        dressCode: 'All-white attire required',
      },
    });
    expect(result.success).toBe(true);

    let { registrationProfile } = tournamentEngine.getRegistrationProfile();
    expect(registrationProfile?.entriesOpen).toBe('2026-05-01');
    expect(registrationProfile?.entriesClose).toBe('2026-05-15');
    expect(registrationProfile?.entryMethod).toBe('ONLINE');
    expect(registrationProfile?.entryUrl).toBe('https://example.com/enter');
    expect(registrationProfile?.dressCode).toBe('All-white attire required');
  });

  it('sets logistics sections with structured options and notes', () => {
    let result: any = tournamentEngine.setRegistrationProfile({
      registrationProfile: {
        accommodation: {
          options: [
            {
              name: 'Grand Hotel',
              address: '123 Main St',
              phone: '+1-555-0100',
              priceRange: '$120-180/night',
              url: 'https://grandhotel.example.com',
            },
            {
              name: 'Budget Inn',
              priceRange: '$60-80/night',
            },
          ],
          notes: '<p>Special tournament rate available — mention code TENNIS2026</p>',
        },
        transportation: {
          notes: '<p>Free shuttle from airport daily at 10am and 4pm</p>',
        },
      },
    });
    expect(result.success).toBe(true);

    let { registrationProfile } = tournamentEngine.getRegistrationProfile();
    expect(registrationProfile?.accommodation?.options).toHaveLength(2);
    expect(registrationProfile?.accommodation?.options?.[0].name).toBe('Grand Hotel');
    expect(registrationProfile?.accommodation?.options?.[0].priceRange).toBe('$120-180/night');
    expect(registrationProfile?.accommodation?.notes).toContain('TENNIS2026');
    expect(registrationProfile?.transportation?.notes).toContain('shuttle');
  });

  it('sets social events', () => {
    let result: any = tournamentEngine.setRegistrationProfile({
      registrationProfile: {
        drawCeremonyDate: '2026-06-01T18:00',
        awardsCeremonyDate: '2026-06-07T17:00',
        socialEvents: [
          {
            name: 'Welcome Dinner',
            date: '2026-06-01',
            time: '19:00',
            location: 'Club Restaurant',
            description: 'Casual dress, complimentary for all participants',
          },
        ],
      },
    });
    expect(result.success).toBe(true);

    let { registrationProfile } = tournamentEngine.getRegistrationProfile();
    expect(registrationProfile?.drawCeremonyDate).toBe('2026-06-01T18:00');
    expect(registrationProfile?.socialEvents).toHaveLength(1);
    expect(registrationProfile?.socialEvents?.[0].name).toBe('Welcome Dinner');
  });

  it('sets entry fees', () => {
    let result: any = tournamentEngine.setRegistrationProfile({
      registrationProfile: {
        entryFees: [
          { amount: 50, currencyCode: 'USD', eventType: 'SINGLES' },
          { amount: 75, currencyCode: 'USD', eventType: 'DOUBLES' },
        ],
      },
    });
    expect(result.success).toBe(true);

    let { registrationProfile } = tournamentEngine.getRegistrationProfile();
    expect(registrationProfile?.entryFees).toHaveLength(2);
    expect(registrationProfile?.entryFees?.[0].amount).toBe(50);
    expect(registrationProfile?.entryFees?.[1].eventType).toBe('DOUBLES');
  });

  it('sets regulations and sponsors', () => {
    let result: any = tournamentEngine.setRegistrationProfile({
      registrationProfile: {
        regulations: [
          { name: 'ITF Rules of Tennis', url: 'https://itftennis.com/rules' },
          { name: 'Local Ground Rules', description: 'Posted at clubhouse' },
        ],
        codeOfConduct: {
          name: 'Player Code of Conduct',
          url: 'https://example.com/conduct',
        },
        sponsors: [
          { name: 'Acme Corp', tier: 'TITLE', websiteUrl: 'https://acme.example.com' },
          { name: 'Local Bank', tier: 'SUPPORTING' },
        ],
      },
    });
    expect(result.success).toBe(true);

    let { registrationProfile } = tournamentEngine.getRegistrationProfile();
    expect(registrationProfile?.regulations).toHaveLength(2);
    expect(registrationProfile?.codeOfConduct?.name).toBe('Player Code of Conduct');
    expect(registrationProfile?.sponsors).toHaveLength(2);
    expect(registrationProfile?.sponsors?.[0].tier).toBe('TITLE');
  });

  it('merges with existing profile on update', () => {
    tournamentEngine.setRegistrationProfile({
      registrationProfile: {
        entriesOpen: '2026-05-01',
        dressCode: 'All-white',
      },
    });

    let result: any = tournamentEngine.setRegistrationProfile({
      registrationProfile: {
        entriesClose: '2026-05-15',
      },
    });
    expect(result.success).toBe(true);

    let { registrationProfile } = tournamentEngine.getRegistrationProfile();
    expect(registrationProfile?.entriesOpen).toBe('2026-05-01');
    expect(registrationProfile?.entriesClose).toBe('2026-05-15');
    expect(registrationProfile?.dressCode).toBe('All-white');
  });

  it('clears profile when falsy value passed', () => {
    tournamentEngine.setRegistrationProfile({
      registrationProfile: { entriesOpen: '2026-05-01' },
    });

    let result: any = tournamentEngine.setRegistrationProfile({ registrationProfile: null });
    expect(result.success).toBe(true);

    let { registrationProfile } = tournamentEngine.getRegistrationProfile();
    expect(registrationProfile).toBeUndefined();
  });

  it('returns deep copy from getRegistrationProfile', () => {
    tournamentEngine.setRegistrationProfile({
      registrationProfile: {
        accommodation: {
          options: [{ name: 'Hotel A' }],
        },
      },
    });

    let { registrationProfile: copy1 } = tournamentEngine.getRegistrationProfile();
    let { registrationProfile: copy2 } = tournamentEngine.getRegistrationProfile();
    expect(copy1).toEqual(copy2);
    expect(copy1).not.toBe(copy2);
    expect(copy1?.accommodation?.options).not.toBe(copy2?.accommodation?.options);
  });

  it('returns undefined when no profile is set', () => {
    let { registrationProfile } = tournamentEngine.getRegistrationProfile();
    expect(registrationProfile).toBeUndefined();
  });

  it('returns error without tournament record loaded', () => {
    tournamentEngine.reset();
    let result: any = tournamentEngine.setRegistrationProfile({
      registrationProfile: { entriesOpen: '2026-05-01' },
    });
    expect(result.error).toBeDefined();

    let queryResult: any = tournamentEngine.getRegistrationProfile();
    expect(queryResult.error).toBeDefined();
  });
});

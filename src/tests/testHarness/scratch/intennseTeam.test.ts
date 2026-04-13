/**
 * Test INTENNSE team tournament configuration and timed set score generation.
 * 2 teams, 7 matchUps (2MS + 2WS + 1MD + 1WD + 1XD), aggregate scoring.
 * Singles: SET2XA-S:T10, Doubles: SET1A-S:T10
 */
import {
  drawDefinitionConstants,
  factoryConstants,
  mocksEngine,
  tournamentEngine,
  matchUpFormatGovernor,
} from '../../..';
import { expect, it, describe } from 'vitest';

const { SINGLE_ELIMINATION } = drawDefinitionConstants;
const { MALE, FEMALE, MIXED } = factoryConstants.genderConstants;
const { TEAM, SINGLES, DOUBLES } = factoryConstants.eventConstants;

const { generateOutcome } = mocksEngine;

const SINGLES_FORMAT = 'SET2XA-S:T10';
const DOUBLES_FORMAT = 'SET1A-S:T10';

const intennseCollections = [
  {
    collectionId: 'intennse-ms',
    collectionName: "Men's Singles",
    matchUpType: SINGLES,
    matchUpCount: 2,
    matchUpFormat: SINGLES_FORMAT,
    scoreValue: 1,
    gender: MALE,
    category: { categoryName: 'MS' },
  },
  {
    collectionId: 'intennse-ws',
    collectionName: "Women's Singles",
    matchUpType: SINGLES,
    matchUpCount: 2,
    matchUpFormat: SINGLES_FORMAT,
    scoreValue: 1,
    gender: FEMALE,
    category: { categoryName: 'WS' },
  },
  {
    collectionId: 'intennse-md',
    collectionName: "Men's Doubles",
    matchUpType: DOUBLES,
    matchUpCount: 1,
    matchUpFormat: DOUBLES_FORMAT,
    scoreValue: 1,
    gender: MALE,
    category: { categoryName: 'MD' },
  },
  {
    collectionId: 'intennse-wd',
    collectionName: "Women's Doubles",
    matchUpType: DOUBLES,
    matchUpCount: 1,
    matchUpFormat: DOUBLES_FORMAT,
    scoreValue: 1,
    gender: FEMALE,
    category: { categoryName: 'WD' },
  },
  {
    collectionId: 'intennse-xd',
    collectionName: 'Mixed Doubles',
    matchUpType: DOUBLES,
    matchUpCount: 1,
    matchUpFormat: DOUBLES_FORMAT,
    scoreValue: 1,
    gender: MIXED,
    category: { categoryName: 'XD' },
  },
];

describe('generateOutcome with timed sets', () => {
  it('generates valid scores for SET2XA-S:T10 (aggregate timed)', () => {
    for (let i = 0; i < 20; i++) {
      const { outcome } = generateOutcome({
        matchUpFormat: SINGLES_FORMAT,
        matchUpStatusProfile: {},
      });

      expect(outcome.winningSide).toBeDefined();
      expect(outcome.score.sets.length).toBe(2); // exactly 2 sets always played

      // Each set should have reasonable point totals (~25 points per 10-min set at 2.5 ppm)
      for (const set of outcome.score.sets) {
        expect(set.side1Score).toBeGreaterThanOrEqual(0);
        expect(set.side2Score).toBeGreaterThanOrEqual(0);
        const total = set.side1Score + set.side2Score;
        expect(total).toBeGreaterThan(10); // at least some points
        expect(total).toBeLessThan(60); // not unreasonably many
      }

      // Aggregate winner should match winningSide
      const side1Total = outcome.score.sets.reduce((s: number, set: any) => s + set.side1Score, 0);
      const side2Total = outcome.score.sets.reduce((s: number, set: any) => s + set.side2Score, 0);
      if (outcome.winningSide === 1) {
        expect(side1Total).toBeGreaterThan(side2Total);
      } else {
        expect(side2Total).toBeGreaterThan(side1Total);
      }
    }

  });

  it('generates valid scores for SET1A-S:T10 (single timed set)', () => {
    for (let i = 0; i < 20; i++) {
      const { outcome } = generateOutcome({
        matchUpFormat: DOUBLES_FORMAT,
        matchUpStatusProfile: {},
      });

      expect(outcome.winningSide).toBeDefined();
      expect(outcome.score.sets.length).toBe(1);

      const set = outcome.score.sets[0];
      expect(set.side1Score).toBeGreaterThanOrEqual(0);
      expect(set.side2Score).toBeGreaterThanOrEqual(0);
      expect(set.side1Score + set.side2Score).toBeGreaterThan(10);
    }

  });

  it('respects winningSide override for aggregate formats', () => {
    for (let side = 1; side <= 2; side++) {
      for (let i = 0; i < 10; i++) {
        const { outcome } = generateOutcome({
          matchUpFormat: SINGLES_FORMAT,
          matchUpStatusProfile: {},
          winningSide: side,
        });
        expect(outcome.winningSide).toBe(side);
      }
    }
  });
});

describe('INTENNSE Showdown tournament', () => {
  it('generates a valid team tournament with correct structure', () => {
    const result = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { tournamentId: 'tournament-id-in-01' },
      participantsProfile: { participantsCount: 0, idPrefix: 'in' },
      tournamentName: 'INTENNSE Showdown',
      drawProfiles: [
        {
          eventType: TEAM,
          drawType: SINGLE_ELIMINATION,
          drawSize: 2,
          teamNames: ['The Authentics', 'Cauldron'],
          teamGenders: { MALE: 3, FEMALE: 3 },
          tieFormat: {
            tieFormatName: 'INTENNSE',
            winCriteria: { aggregateValue: true },
            collectionDefinitions: intennseCollections,
          },
        },
      ],
    });

    expect(result.tournamentRecord).toBeDefined();
    const tr = result.tournamentRecord;

    // Verify teams exist with correct names and useOtherName is false
    const teams = tr.participants.filter((p: any) => p.participantType === 'TEAM');
    expect(teams.length).toBe(2);
    const teamNames = teams.map((t: any) => t.participantName).sort();
    expect(teamNames).toEqual(['Cauldron', 'The Authentics']);
    for (const team of teams) {
      expect(team.useOtherName).toBe(false);
      expect(team.participantOtherName).toBeDefined();
    }

    // Verify matchUp structure
    tournamentEngine.setState(tr);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const tieMatchUps = matchUps.filter((m: any) => m.collectionId);
    expect(tieMatchUps.length).toBe(7);

    // Verify correct matchUpFormats assigned
    const singlesMatchUps = tieMatchUps.filter((m: any) => m.matchUpFormat === SINGLES_FORMAT);
    const doublesMatchUps = tieMatchUps.filter((m: any) => m.matchUpFormat === DOUBLES_FORMAT);
    expect(singlesMatchUps.length).toBe(4);
    expect(doublesMatchUps.length).toBe(3);

    // Verify collection IDs
    const collectionIds = [...new Set(tieMatchUps.map((m: any) => m.collectionId))].sort();
    expect(collectionIds).toEqual(['intennse-md', 'intennse-ms', 'intennse-wd', 'intennse-ws', 'intennse-xd']);

    // Verify each team has 6 members: 3 MALE + 3 FEMALE
    const individuals = tr.participants.filter((p: any) => p.participantType === 'INDIVIDUAL');
    for (const team of teams) {
      expect(team.individualParticipantIds.length).toBe(6);
      const members = team.individualParticipantIds.map((id: string) =>
        individuals.find((p: any) => p.participantId === id),
      );
      const males = members.filter((p: any) => p.person?.sex === MALE);
      const females = members.filter((p: any) => p.person?.sex === FEMALE);
      expect(males.length).toBe(3);
      expect(females.length).toBe(3);
    }

    // Verify event and tieFormat
    expect(tr.events[0].eventType).toBe(TEAM);
    expect(tr.events[0].tieFormat.winCriteria.aggregateValue).toBe(true);
  });

  it('teamGenders acts as a floor override, not a ceiling', () => {
    // Without teamGenders, processTieFormat computes MALE: 2, FEMALE: 2 via max-per-collection.
    // The remaining pool (teamSize - 4 = 2) ends up empty because generateParticipants
    // assigns random sex to "unsexed" participants, so they go into gendered pools
    // but the team builder only takes genders[MALE] + genders[FEMALE] per team.
    const withoutOverride = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0, idPrefix: 'no-tg' },
      drawProfiles: [
        {
          eventType: TEAM,
          drawType: SINGLE_ELIMINATION,
          drawSize: 2,
          tieFormat: {
            tieFormatName: 'INTENNSE',
            winCriteria: { aggregateValue: true },
            collectionDefinitions: intennseCollections,
          },
        },
      ],
    });

    const trNoOverride = withoutOverride.tournamentRecord;
    const teamsNoOverride = trNoOverride.participants.filter((p: any) => p.participantType === 'TEAM');
    const individualsNoOverride = trNoOverride.participants.filter((p: any) => p.participantType === 'INDIVIDUAL');

    // Without override: teams only have 4 members (2M + 2F) — insufficient for INTENNSE
    for (const team of teamsNoOverride) {
      expect(team.individualParticipantIds.length).toBe(4);
      const members = team.individualParticipantIds.map((id: string) =>
        individualsNoOverride.find((p: any) => p.participantId === id),
      );
      const males = members.filter((p: any) => p.person?.sex === MALE);
      const females = members.filter((p: any) => p.person?.sex === FEMALE);
      expect(males.length).toBe(2);
      expect(females.length).toBe(2);
    }

    // With teamGenders override: each team gets exactly 3M + 3F — sufficient for INTENNSE
    const withOverride = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0, idPrefix: 'tg' },
      drawProfiles: [
        {
          eventType: TEAM,
          drawType: SINGLE_ELIMINATION,
          drawSize: 2,
          teamGenders: { MALE: 3, FEMALE: 3 },
          tieFormat: {
            tieFormatName: 'INTENNSE',
            winCriteria: { aggregateValue: true },
            collectionDefinitions: intennseCollections,
          },
        },
      ],
    });

    const trOverride = withOverride.tournamentRecord;
    const teamsOverride = trOverride.participants.filter((p: any) => p.participantType === 'TEAM');
    const individualsOverride = trOverride.participants.filter((p: any) => p.participantType === 'INDIVIDUAL');

    for (const team of teamsOverride) {
      expect(team.individualParticipantIds.length).toBe(6);
      const members = team.individualParticipantIds.map((id: string) =>
        individualsOverride.find((p: any) => p.participantId === id),
      );
      const males = members.filter((p: any) => p.person?.sex === MALE);
      const females = members.filter((p: any) => p.person?.sex === FEMALE);
      expect(males.length).toBe(3);
      expect(females.length).toBe(3);
    }

    // With override: 12 individuals (6M + 6F), no unsexed
    expect(individualsOverride.length).toBe(12);
    const overrideMales = individualsOverride.filter((p: any) => p.person?.sex === MALE);
    const overrideFemales = individualsOverride.filter((p: any) => p.person?.sex === FEMALE);
    expect(overrideMales.length).toBe(6);
    expect(overrideFemales.length).toBe(6);
  });

  it('generates jersey details on individual team members', () => {
    const result = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0, idPrefix: 'jersey' },
      drawProfiles: [
        {
          eventType: TEAM,
          drawType: SINGLE_ELIMINATION,
          drawSize: 2,
          teamNames: ['Alpha Squad', 'Beta Force'],
          teamGenders: { MALE: 3, FEMALE: 3 },
          tieFormat: {
            tieFormatName: 'INTENNSE',
            winCriteria: { aggregateValue: true },
            collectionDefinitions: intennseCollections,
          },
        },
      ],
    });

    let result2: any = result;
    expect(result2.tournamentRecord).toBeDefined();
    const tr = result2.tournamentRecord;
    const teams = tr.participants.filter((p: any) => p.participantType === 'TEAM');
    const individuals = tr.participants.filter((p: any) => p.participantType === 'INDIVIDUAL');

    for (const team of teams) {
      // Every member should have teamAttributes with jersey info
      for (const memberId of team.individualParticipantIds) {
        const member = individuals.find((p: any) => p.participantId === memberId);
        expect(member).toBeDefined();
        const teamAttrs = member.person?.biographicalInformation?.teamAttributes;
        expect(teamAttrs).toBeDefined();
        expect(teamAttrs.length).toBeGreaterThanOrEqual(1);

        // Find the entry for this team
        const attr = teamAttrs.find((a: any) => a.teamId === team.participantId);
        expect(attr).toBeDefined();
        expect(attr.teamName).toBe(team.participantName);
        expect(attr.jerseyNumber).toBeDefined();
        expect(Number.parseInt(attr.jerseyNumber)).toBeGreaterThan(0);
        expect(attr.jerseyName).toBe(member.person.standardFamilyName.toUpperCase());
      }

      // Jersey numbers should be sequential 1..N within a team
      const jerseyNumbers = team.individualParticipantIds.map((id: string) => {
        const member = individuals.find((p: any) => p.participantId === id);
        const attr = member.person.biographicalInformation.teamAttributes.find(
          (a: any) => a.teamId === team.participantId,
        );
        return Number.parseInt(attr.jerseyNumber);
      });
      jerseyNumbers.sort((a: number, b: number) => a - b);
      expect(jerseyNumbers).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('useOtherName controls participant display name preference', () => {
    const result = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0, idPrefix: 'uon' },
      drawProfiles: [
        {
          eventType: TEAM,
          drawType: SINGLE_ELIMINATION,
          drawSize: 2,
          teamNames: ['The Authentics', 'Cauldron'],
          teamGenders: { MALE: 3, FEMALE: 3 },
          tieFormat: {
            tieFormatName: 'INTENNSE',
            winCriteria: { aggregateValue: true },
            collectionDefinitions: intennseCollections,
          },
        },
      ],
    });

    let result2: any = result;
    const tr = result2.tournamentRecord;
    const teams = tr.participants.filter((p: any) => p.participantType === 'TEAM');

    // TEAM participants should have useOtherName: false by default
    for (const team of teams) {
      expect(team.useOtherName).toBe(false);
      expect(team.participantOtherName).toMatch(/^TM\d+$/);
    }

    // When useOtherName is false, participantName should be preferred
    const authentics = teams.find((t: any) => t.participantName === 'The Authentics');
    expect(authentics.participantOtherName).toBe('TM1');
    // Display logic: useOtherName=false means participantName wins
    const displayName = authentics.useOtherName
      ? authentics.participantOtherName
      : authentics.participantName;
    expect(displayName).toBe('The Authentics');

    // When useOtherName is true, participantOtherName should be preferred
    authentics.useOtherName = true;
    const altDisplayName = authentics.useOtherName
      ? authentics.participantOtherName
      : authentics.participantName;
    expect(altDisplayName).toBe('TM1');
  });

  it('generates a complete INTENNSE tournament with completeAllMatchUps', () => {
    const result = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 0, idPrefix: 'in-complete' },
      tournamentName: 'INTENNSE Complete',
      completeAllMatchUps: true,
      drawProfiles: [
        {
          eventType: TEAM,
          drawType: SINGLE_ELIMINATION,
          drawSize: 2,
          teamNames: ['The Authentics', 'Cauldron'],
          teamGenders: { MALE: 3, FEMALE: 3 },
          tieFormat: {
            tieFormatName: 'INTENNSE',
            winCriteria: { aggregateValue: true },
            collectionDefinitions: intennseCollections,
          },
        },
      ],
    });

    expect(result.tournamentRecord).toBeDefined();
    const tr = result.tournamentRecord;

    tournamentEngine.setState(tr);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const tieMatchUps = matchUps.filter((m: any) => m.collectionId);

    // All 7 tieMatchUps should be present
    expect(tieMatchUps.length).toBe(7);

    // Verify correct collection structure
    const collectionIds = [...new Set(tieMatchUps.map((m: any) => m.collectionId))].sort();
    expect(collectionIds).toEqual(['intennse-md', 'intennse-ms', 'intennse-wd', 'intennse-ws', 'intennse-xd']);

    // The parent (TEAM) matchUp should exist
    const teamMatchUps = matchUps.filter((m: any) => !m.collectionId && m.tieMatchUps);
    expect(teamMatchUps.length).toBe(1);
  });
});

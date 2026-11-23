import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

const processCodes = ['RATING.IGNORE'];

it('will hydrate matchUps with tournament level processCodes', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { processCodes },
    drawProfiles: [{ drawSize: 4 }],
  });

  const matchUps = tournamentEngine.setState(tournamentRecord).allTournamentMatchUps().matchUps;

  for (const matchUp of matchUps) {
    expect(matchUp.processCodes).toEqual(processCodes);
  }
});

it('will hydrate matchUps with event level processCodes', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ processCodes, drawProfiles: [{ drawSize: 4 }] }],
  });

  const matchUps = tournamentEngine.setState(tournamentRecord).allTournamentMatchUps().matchUps;

  for (const matchUp of matchUps) {
    expect(matchUp.processCodes).toEqual(processCodes);
  }
});

it('will hydrate matchUps with drawDefinition level processCodes', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, processCodes }],
  });

  const matchUps = tournamentEngine.setState(tournamentRecord).allTournamentMatchUps().matchUps;

  for (const matchUp of matchUps) {
    expect(matchUp.processCodes).toEqual(processCodes);
  }
});

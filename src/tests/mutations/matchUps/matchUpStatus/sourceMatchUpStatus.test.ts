import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, COMPLETED } from '@Constants/matchUpStatusConstants';

it('generates appropriate sourceMatchUpStatuses in sideExitProvenance', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 4,
        outcomes: [
          {
            roundNumber: 1,
            roundPosition: 1,
            matchUpStatus: DOUBLE_WALKOVER,
          },
          {
            roundNumber: 1,
            roundPosition: 2,
            scoreString: '6-1 6-3',
            winningSide: 1,
          },
        ],
      },
    ],
  });
  tournamentEngine.setState(tournamentRecord);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  let matchUp = matchUps.find(({ roundNumber }) => roundNumber === 2);

  // P37. Each side's ORIGIN, read from the side-keyed record rather than from the legacy array's
  // positional `previousMatchUpStatus`. The facts are the same and the side is now the key.
  expect(matchUp.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(matchUp.sideExitProvenance?.[2]?.previousMatchUpStatus).toEqual(COMPLETED);

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: TO_BE_PLAYED,
    winningSide: undefined,
  });

  const matchUpId = matchUps.find(
    ({ roundNumber, roundPosition }) => roundNumber === 1 && roundPosition === 2,
  ).matchUpId;

  const result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  matchUp = matchUps.find(({ roundNumber }) => roundNumber === 2);

  // P37, AND A REAL DIFFERENCE, recorded rather than smoothed over. The legacy array reads
  // `['DOUBLE_WALKOVER', 'TO_BE_PLAYED']` here: side 2's source was un-scored back to TO_BE_PLAYED and
  // the array stores that as though it were an origin. Provenance refuses to —
  // `updateMatchUpStatusCodes` records nothing for an UNDECIDED source, because *"provenance can never
  // be TO_BE_PLAYED"* — so side 2 simply has no entry, which is the truthful statement of the same
  // event. Measured 2026-09-27: `{"1":{…DOUBLE_WALKOVER}}`, side 2 absent.
  expect(matchUp.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(matchUp.sideExitProvenance?.[2]).toBeUndefined();
});

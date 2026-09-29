import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * `setMatchUpStatus` FINDS THE DRAW WHEN IT IS GIVEN A `drawId`.
 *
 * Its own source says so: *"Auto-resolve drawDefinition if not provided … allows calling with just
 * tournamentId/eventId/drawId instead of passing full objects."* The required-parameter check ran
 * first and asked for `drawDefinition`, so every call the resolution was written for was refused
 * before reaching it. Only a caller passing `_bypassParamCheck` got through.
 *
 * The engine always hands over a `drawDefinition`, which is why nothing noticed.
 */

const DRAW_ID = 'resolves';
const MATCHUP_ID = 'm-1-1';

function generate() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawSize: 8, idPrefix: 'm' }],
    setState: true,
  });
  return (tournamentEngine.getTournament() as any).tournamentRecord;
}

const stored = (tournamentRecord: any) =>
  tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.find(
    (matchUp: any) => matchUp.matchUpId === MATCHUP_ID,
  );

it('scores a matchUp given a tournamentRecord and a drawId', () => {
  const tournamentRecord = generate();
  // CONTROL: nothing is scored yet
  expect(stored(tournamentRecord).winningSide).toBeUndefined();

  const result: any = setMatchUpStatus({
    outcome: { matchUpStatus: COMPLETED, winningSide: 1 },
    matchUpId: MATCHUP_ID,
    drawId: DRAW_ID,
    tournamentRecord,
  } as any);

  expect(result.success).toEqual(true);
  expect(stored(tournamentRecord).winningSide).toEqual(1);
});

it('finds the tournament by tournamentId among several records', () => {
  const tournamentRecord = generate();

  const result: any = setMatchUpStatus({
    tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
    outcome: { matchUpStatus: COMPLETED, winningSide: 2 },
    tournamentId: tournamentRecord.tournamentId,
    matchUpId: MATCHUP_ID,
    drawId: DRAW_ID,
  } as any);

  expect(result.success).toEqual(true);
  expect(stored(tournamentRecord).winningSide).toEqual(2);
});

it('refuses a draw that does not exist, and says what is missing', () => {
  const tournamentRecord = generate();

  const result: any = setMatchUpStatus({
    outcome: { matchUpStatus: COMPLETED, winningSide: 1 },
    matchUpId: MATCHUP_ID,
    drawId: 'no-such-draw',
    tournamentRecord,
  } as any);

  expect(result.success).toBeUndefined();
  expect(result.error).toBeDefined();
  expect(stored(tournamentRecord).winningSide).toBeUndefined();
});

it('says a drawDefinition is missing when there is no id to find one by', () => {
  const tournamentRecord = generate();
  const result: any = setMatchUpStatus({ matchUpId: MATCHUP_ID, tournamentRecord } as any);
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
});

it('still refuses a call with no matchUpId', () => {
  const tournamentRecord = generate();
  const result: any = setMatchUpStatus({ drawId: DRAW_ID, tournamentRecord } as any);
  expect(result.error).toBeDefined();
});

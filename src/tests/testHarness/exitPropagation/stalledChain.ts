import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

/** the four matchUps `playStalledChain` leaves stalled, each feeding the next */
export const STALLED_CHAIN = ['Main|2|8', 'Main|3|4', 'Main|4|2', 'Main|5|1'];

/**
 * A DRAW THAT STALLS, BUILT ON PURPOSE, because the matrix no longer holds one.
 *
 * The stalled-position detector needs a draw it must fire on, and each one the matrix offered was fixed in turn:
 * DOUBLE_ELIMINATION 8/7 at seed 77 (`settleHeldExits`), then 16/13 at seed 117 under the produced-exit policy, the
 * last, when a carried exit meeting an exit began to converge (2026-10-06; both stall budgets at zero). So the state
 * is made directly: SINGLE_ELIMINATION 32/32, everything played out but `Main|1|16`, which is then written onto the
 * stored record as a DOUBLE_WALKOVER whose cascade never ran. Its winner seat in `Main|2|8` can never be filled, and four
 * participants wait in a chain behind it, `Main|2|8` up to the final. It is the shape every natural stall had: an
 * exit that never reached the matchUp it should have decided.
 */
export function playStalledChain(drawId: string): void {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 32, participantsCount: 32, drawId }],
    setState: true,
  });
  const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];

  for (let played = 1; played;) {
    played = 0;
    for (const matchUp of matchUps()) {
      if (key(matchUp) === 'Main|1|16' || matchUp.winningSide) continue;
      if (matchUp.matchUpStatus && matchUp.matchUpStatus !== 'TO_BE_PLAYED') continue;
      if ((matchUp.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: { winningSide: 1 },
        drawId,
      });
      if (!result.error) played += 1;
    }
  }

  // last, so nothing has advanced against it: the double walkover whose cascade never ran
  const tournamentRecord: any = tournamentEngine.getTournament().tournamentRecord;
  const origin = matchUps().find((matchUp) => key(matchUp) === 'Main|1|16');
  const stored = tournamentRecord.events
    .flatMap((event: any) => event.drawDefinitions ?? [])
    .flatMap((drawDefinition: any) => drawDefinition.structures ?? [])
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === origin.matchUpId);
  stored.matchUpStatus = DOUBLE_WALKOVER;
  tournamentEngine.setState(tournamentRecord);
}

import { getStructureInconsistencies, WINNER_NOT_ADVANCED } from '@Query/drawDefinition/getStructureInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import {
  COMPASS,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  OLYMPIC,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

test('detects a winning-side participant that did not advance within the structure', () => {
  setSubscriptions({});
  const drawId = 'winnotadv';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION, idPrefix: 'w' }],
    completeAllMatchUps: true,
    setState: true,
  });
  expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);

  // identify a round-1 matchUp, its winner, and its (same-structure) next matchUp
  const m = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find((x) => x.roundNumber === 1 && x.roundPosition === 1 && x.winningSide);
  const winnerSide = m.sides.find((s) => s.sideNumber === m.winningSide);

  // deep copy — drop the winner's drawPosition from the next matchUp so the winner is absent there
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const nextMatchUp = drawDefinition.structures[0].matchUps.find((x) => x.matchUpId === m.winnerMatchUpId);
  nextMatchUp.drawPositions = (nextMatchUp.drawPositions ?? []).filter((dp) => dp !== winnerSide.drawPosition);

  const result: any = getStructureInconsistencies({ drawDefinition });
  const dropped = result.inconsistencies.find(
    (i) => i.matchUpId === m.matchUpId && i.issueType === WINNER_NOT_ADVANCED,
  );
  expect(dropped).toBeTruthy();
  expect(dropped.winnerMatchUpId).toEqual(m.winnerMatchUpId);
  expect(dropped.severity).toEqual('error');
});

// Corpus sweep — no completed draw may report WINNER_NOT_ADVANCED. Critically includes
// DOUBLE_ELIMINATION, whose consolation-final winner feeds back into MAIN via a CROSS-structure
// winnerMatchUpId conditional on loss history — the guard must exclude it (no false positive).
test.for([
  [SINGLE_ELIMINATION, 32],
  [FIRST_MATCH_LOSER_CONSOLATION, 32],
  [COMPASS, 32],
  [CURTIS_CONSOLATION, 32],
  [OLYMPIC, 32],
  [DOUBLE_ELIMINATION, 16],
])('corpus: completed %s drawSize %d reports no WINNER_NOT_ADVANCED', ([drawType, drawSize]) => {
  setSubscriptions({});
  const drawId = `adv-${drawType}-${drawSize}`;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize, drawType }],
    completeAllMatchUps: true,
    setState: true,
  });
  const result: any = tournamentEngine.getStructureInconsistencies({ drawId });
  expect(result.inconsistencies.filter((i) => i.issueType === WINNER_NOT_ADVANCED)).toEqual([]);
  expect(result.valid).toEqual(true);
});

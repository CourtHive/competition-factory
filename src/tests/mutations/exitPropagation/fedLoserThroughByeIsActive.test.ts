import { getDrawDefinition, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A fed first-match loser who advanced THROUGH a consolation BYE and played on makes the Main matchUp
 * that fed them active downstream.
 *
 * `isActiveDownstream` treated every FIRST_MATCHUP BYE matchUp as inert. That is right when the fed
 * slot itself is the BYE (the loser was withheld) and wrong when the loser is there and the BYE is
 * their opponent: clearing the Main result removed them from the consolation while the match they
 * had played there stood, over an empty drawPosition. Census 9000458, shrunk, both flag arms.
 */
it.each([false, true])(
  'clearing a Main result whose loser played on through a BYE is refused (flag %s)',
  (allowChangePropagation) => {
    const drawId = 'fed-through-bye';
    setSubscriptions({});
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 5, drawId }],
      nonRandom: 9000458,
      setState: true,
    });
    const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
    const find = (k: string) =>
      tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps.find((m: any) => key(m) === k);
    const submit = (k: string, outcome: any) =>
      tournamentEngine.setMatchUpStatus({
        matchUpId: find(k).matchUpId,
        propagateExitStatus: true,
        allowChangePropagation,
        outcome,
        drawId,
      }) as any;

    expect(submit('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }).error).toBeUndefined();
    expect(submit('Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }).error).toBeUndefined();
    expect(submit('Main|2|2', { winningSide: 2 }).error).toBeUndefined();
    expect(submit('Consolation|3|1', { winningSide: 2 }).error).toBeUndefined();
    // control: the Main r2p1 loser is in the consolation and their match there is decided
    expect(find('Consolation|3|1').winningSide).toBeDefined();

    const before = hash(getDrawDefinition(drawId));
    const result = submit('Main|2|1', {
      score: { scoreStringSide1: '', scoreStringSide2: '' },
      matchUpStatus: 'TO_BE_PLAYED',
    });
    expect(result.error).toBeDefined();
    expect(hash(getDrawDefinition(drawId))).toEqual(before);
    expect(tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).toEqual([]);
  },
);

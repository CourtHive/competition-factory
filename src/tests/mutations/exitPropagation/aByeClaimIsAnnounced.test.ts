import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

/**
 * A BYE CLAIM RECORDED ON A LOSER MATCHUP IS ANNOUNCED (NOTE 2026-10-18 "unannounced carry writes", the backlog).
 *
 * A double exit claims the BYE it sends to its loser target (`advanceByeToLoserMatchUp` → `recordByeClaim`), and the
 * claim is recorded before the BYE is placed because placing it can write nothing. When it writes nothing, nothing
 * announced the matchUp the claim was recorded on, and a notice-driven save (a server projection, an embedding client)
 * kept it without the claim: 3,402 uncovered matchUps across the exitPropagation folder under `NOTICE_COVERAGE=1`.
 *
 * COMPASS 8/8: `East|1|1` and `East|1|2` are both double walkovers, and each sends a BYE into `West|1|1`. The second
 * finds the first's BYE already in place. Falsified without the announcement: `West|1|1` changes in the second call
 * and is absent from its MODIFY_MATCHUP notices.
 */
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const matchUpIdAt = (drawId: string, at: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === at)?.matchUpId;
const storedAt = (drawId: string, at: string) => {
  const stored = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: false })
    .matchUps.find((matchUp: any) => matchUp.matchUpId === matchUpIdAt(drawId, at));
  const { updatedAt: _updatedAt, ...rest } = stored;
  return JSON.stringify(rest);
};

afterEach(() => setSubscriptions({}));

it('the loser matchUp a double exit records its BYE claim on is announced in that call', () => {
  setSubscriptions({});
  const drawId = 'bye-claim-is-announced';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: COMPASS, drawSize: 8, participantsCount: 8 }],
    setState: true,
  });
  const doubleWalkover = (at: string) => {
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: matchUpIdAt(drawId, at),
      propagateExitStatus: true,
      drawId,
    });
    expect(result.error, at).toBeUndefined();
  };

  doubleWalkover('East|1|1');

  const before = storedAt(drawId, 'West|1|1');
  const announced: string[] = [];
  setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (notices: any[]) => notices.forEach((notice) => announced.push(notice.matchUp?.matchUpId)),
    },
  });
  doubleWalkover('East|1|2');

  // CONTROL: the second double exit wrote its claim on West|1|1
  expect(storedAt(drawId, 'West|1|1')).not.toEqual(before);
  const holder = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === 'West|1|1');
  const claims = Object.values(holder.sideExitProvenance ?? {}).flatMap((entry: any) => entry?.byeClaims ?? []);
  expect(claims).toContain(matchUpIdAt(drawId, 'East|1|2'));

  // and the matchUp is announced
  expect(announced).toContain(holder.matchUpId);
});

import { clearOutcome, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * `ALLOW_CHANGE_PROPAGATION=1` makes the harness drive the path production actually takes.
 *
 * `resolveAndApplyOutcome` checks `allowChangePropagation` BEFORE the `activeDownstream` dispatch,
 * so it short-circuits to `swapWinnerLoser` past every refusal guarding an ordinary re-score.
 * Whether it is sent is a CONSUMER CHOICE — some scoring clients set it on every score, others do
 * not permit a winning-side change to propagate at all — so both behaviours need measuring.
 * Measured over two 600-seed frozen windows the day this flag was added: 8 and 13 failing seeds
 * without it, 73 and 75 with it.
 */

const coordinates = (item: any) => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

afterEach(() => {
  delete process.env.ALLOW_CHANGE_PROPAGATION;
});

function replayToTheFlip(drawId: string, { clearConsolationBeforeFlip = false } = {}) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 27, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawId }],
    nonRandom: 9000349,
    setState: true,
  });
  setSubscriptions({});

  const steps: any[] = [
    { coordinate: 'Main|1|11', outcome: { winningSide: 2 } },
    { coordinate: 'Main|2|6', outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } },
    { coordinate: 'Consolation|2|6', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
    ...(clearConsolationBeforeFlip ? [{ coordinate: 'Consolation|2|6', outcome: clearOutcome }] : []),
    { coordinate: 'Main|2|6', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
  ];

  let last: any;
  for (const step of steps) {
    const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
    const target = matchUps.find((matchUp: any) => coordinates(matchUp) === step.coordinate);
    expect(target, `no matchUp at ${step.coordinate}`).toBeDefined();
    last = observeMutation({ matchUpId: target.matchUpId, outcome: step.outcome, drawId });
  }
  return last;
}

it('is OFF by default — the winner flip is refused', () => {
  const observation = replayToTheFlip('acp-off');
  expect(observation.error?.code).toEqual('ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE');
});

/**
 * Set, the flip reaches `swapWinnerLoser` instead of the re-score guard — visible here as a
 * different refusal: the flip makes the consolation loser ineligible over a consolation result that
 * was played, which cannot be inherited (CA, 2026-09-17). Clearing that result, the flip succeeds.
 */
it('routes through swapWinnerLoser when set, so the same flip reaches its own refusal', () => {
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  const observation = replayToTheFlip('acp-on');
  expect(observation.error?.code).toEqual('ERR_ACTIVE_DRAW_POSITION');
});

it('routes through swapWinnerLoser when set, and succeeds once nothing downstream is active', () => {
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  replayToTheFlip('acp-on-clear', { clearConsolationBeforeFlip: true });
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId: 'acp-on-clear' })?.matchUps ?? [];
  const flipped = matchUps.find((matchUp: any) => coordinates(matchUp) === 'Main|2|6');
  expect(flipped.winningSide).toEqual(2);
});

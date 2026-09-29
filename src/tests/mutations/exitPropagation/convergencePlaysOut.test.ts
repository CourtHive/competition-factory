import { setSubscriptions } from '@Global/state/globalState';
import { isDoubleExit, isExit } from '@Validators/isExit';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { BYE, COMPLETED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * AFTER TWO DOUBLE EXITS THE DRAW STILL PLAYS TO THE END.
 *
 * The sweeps in `correctionDivergence` compare two draws and say whether they AGREE. Neither says
 * whether either one WORKS, and a draw can agree with itself perfectly while stranding somebody.
 * This plays every draw to exhaustion and asks the four things a director would notice.
 *
 * ## What it found, 2026-09-28
 *
 * | | before | after P44 | after this guard |
 * |---|---|---|---|
 * | participants stranded with no opponent and no award | 36 | 12 | **0** |
 * | scores refused | 16 | 12 | **0** |
 * | draws with an error-severity inconsistency | 16 | 12 | **0** |
 * | matchUps decided | 704 | 728 | **764** |
 *
 * The last twelve were one defect in three draw types. `doubleExitAdvancement` stamps an arriving
 * exit on a BYE-held loser target and then carries it onward; the stamp declines a target seat that
 * is itself the BYE — that loser is already represented — and the carry ran anyway. See
 * `doubleExitAdvancement`, *"AN EXIT THAT WAS NOT RECORDED HERE DOES NOT TRAVEL ON FROM HERE"*.
 *
 * Every count is an invariant at zero. **Do not introduce a baseline here.**
 */

const DRAW_TYPES = [
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
];

const CELLS = DRAW_TYPES.flatMap((drawType) =>
  [8, 16].flatMap((drawSize) =>
    [
      [1, 2],
      [2, 1],
    ].flatMap((order) => [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((flavour) => ({ drawType, drawSize, order, flavour }))),
  ),
);

const STRAIGHT_SETS = {
  matchUpStatus: COMPLETED,
  winningSide: 1,
  score: {
    sets: [
      { side1Score: 6, side2Score: 1, setNumber: 1, winningSide: 1 },
      { side1Score: 6, side2Score: 1, setNumber: 2, winningSide: 1 },
    ],
  },
};

const allMatchUps = (): any[] => tournamentEngine.allTournamentMatchUps().matchUps ?? [];
const participantCount = (matchUp: any) => (matchUp.sides ?? []).filter((side: any) => side.participantId).length;
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

/** two first-round double exits in the given order, then every playable matchUp until none is left */
function playOut({ drawType, drawSize, order, flavour }: (typeof CELLS)[number]) {
  setSubscriptions({});
  const drawId = 'plays-out';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { propagateExitStatus: true } },
    drawProfiles: [{ drawType, drawSize, participantsCount: drawSize, drawId }],
    nonRandom: 9000230,
  });
  tournamentEngine.setState(tournamentRecord);

  // the entry structure holds the most round-1 matchUps; COMPASS and OLYMPIC open in `East`
  const roundOneCounts = new Map<string, number>();
  for (const matchUp of allMatchUps().filter((candidate) => candidate.roundNumber === 1)) {
    roundOneCounts.set(matchUp.structureName, (roundOneCounts.get(matchUp.structureName) ?? 0) + 1);
  }
  const entry = [...roundOneCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

  const refused: string[] = [];
  const score = (matchUp: any, outcome: any) => {
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, drawId, outcome });
    if (!result.success) refused.push(`${coordinate(matchUp)}:${result.error?.code}`);
    return !!result.success;
  };

  for (const roundPosition of order) {
    const target = allMatchUps().find(
      (matchUp) =>
        matchUp.structureName === entry && matchUp.roundNumber === 1 && matchUp.roundPosition === roundPosition,
    );
    score(target, { matchUpStatus: flavour });
  }

  let played = 0;
  for (let guard = 0; guard < 200; guard++) {
    const next = allMatchUps().find(
      (matchUp) => matchUp.matchUpStatus === TO_BE_PLAYED && participantCount(matchUp) === 2,
    );
    if (!next || !score(next, STRAIGHT_SETS)) break;
    played += 1;
  }

  const final = allMatchUps();
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { inconsistencies }: any = tournamentEngine.getDrawInconsistencies({ drawDefinition, drawId });

  return {
    played,
    refused,
    // somebody is sitting in a matchUp that nobody else will ever enter, and was awarded nothing
    // — and NOT beside a BYE, which holds one participant by design and advances them
    stranded: final
      .filter((matchUp) => !matchUp.winningSide && participantCount(matchUp) === 1 && matchUp.matchUpStatus !== BYE)
      .map(coordinate),
    // a match between two people who are both there, decided without being played
    unplayedDecisions: final
      .filter((matchUp) => isExit(matchUp.matchUpStatus) && participantCount(matchUp) === 2)
      .map(coordinate),
    ownWins: final
      .filter(
        (matchUp) =>
          isExit(matchUp.matchUpStatus) &&
          isDoubleExit(matchUp.sideExitProvenance?.[matchUp.winningSide]?.previousMatchUpStatus),
      )
      .map(coordinate),
    errors: (inconsistencies ?? [])
      .filter((issue: any) => issue.severity !== 'warning')
      .map((issue: any) => issue.issueType),
  };
}

it('plays every draw to the end after two first-round double exits', () => {
  const findings: string[] = [];
  let played = 0;

  for (const cell of CELLS) {
    const { played: count, ...outcome } = playOut(cell);
    played += count;
    for (const [kind, found] of Object.entries(outcome)) {
      if (found.length) {
        findings.push(`${cell.drawType} ${cell.drawSize} ${cell.order.join('>')} ${cell.flavour} ${kind}: ${found}`);
      }
    }
  }

  // CONTROL: the sweep ran, and it actually played matches — a loop that scored nothing would find
  // nothing, and would report that as a clean result
  expect(CELLS.length).toEqual(56);
  expect(played).toBeGreaterThan(CELLS.length * 4);

  expect(findings).toEqual([]);
}, 180_000);

it('does not carry an exit on from a loser target whose own seat is already the BYE', () => {
  for (const drawType of [MODIFIED_FEED_IN_CHAMPIONSHIP, CURTIS_CONSOLATION]) {
    const outcome = playOut({ drawType, drawSize: 16, order: [1, 2], flavour: DOUBLE_WALKOVER });
    const consolation = drawType === CURTIS_CONSOLATION ? 'Consolation 1' : 'Consolation';
    const find = (roundNumber: number, roundPosition: number) =>
      allMatchUps().find((matchUp) => coordinate(matchUp) === `${consolation}|${roundNumber}|${roundPosition}`);

    // CONTROL: the arrangement under test — the seat Main|2|1's loser would take is a BYE, and the
    // survivor beside it is a real participant who advanced through
    const byeHeld = find(2, 4);
    expect(byeHeld.sides.find((side: any) => side.sideNumber === 1)?.bye, `${drawType}: the loser seat`).toEqual(true);
    expect(byeHeld.sides.find((side: any) => side.sideNumber === 2)?.participantId).toBeTruthy();

    // the semifinal those two reach was PLAYED, by two people who were both there
    const semifinal = find(3, 2);
    expect(participantCount(semifinal)).toEqual(2);
    expect(semifinal.matchUpStatus, `${drawType}: a match between two participants is played`).toEqual(COMPLETED);
    expect(semifinal.sideExitProvenance, 'and neither of them carries an exit').toBeUndefined();

    // so the final holds one from each semifinal, and the score that was refused is accepted
    expect(outcome.refused).toEqual([]);
    expect(participantCount(find(4, 1))).toEqual(2);
  }
});

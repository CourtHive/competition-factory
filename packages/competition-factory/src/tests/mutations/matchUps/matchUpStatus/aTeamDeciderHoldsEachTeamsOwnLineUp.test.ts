import { resolveTieFormat } from '@courthive/competition-catalogue';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DEAD_RUBBER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { TEAM } from '@Constants/eventConstants';

/**
 * A TEAM DECIDER HOLDS EACH TEAM'S OWN LINE-UP.
 *
 * A DOUBLE_ELIMINATION final sends its winner AND its loser to the Decider. Decided by a line, the final carried both
 * line-ups there, and the loser's was reckoned as a consolation feed's is (`propagateLoserLineUp`: a first-round target
 * takes the side its source's round position gives), which for the final is side 1: the winner's side. Rendered, the
 * winning team stood on side 1 holding the losing team's line-up, and each line of the Decider showed the same pair on
 * both sides. Fixed in v1 and in the outcome pipeline v2 together; the loser of a final sits second.
 *
 * Asserted on the hydrated Decider, for the final won by either side: the undefeated finalist winning leaves the
 * Decider a DEAD_RUBBER; the Backdraw champion winning leaves it to be played, with the line-ups a director would see.
 */

const DRAW_ID = 'team-decider';
const ROUNDS: [string, number][] = [
  ['Main', 1],
  ['Backdraw', 1],
  ['Main', 2],
  ['Backdraw', 2],
  ['Backdraw', 3],
  ['Main', 3],
  ['Backdraw', 4],
];

const duals = (): any[] =>
  tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM] } }).matchUps ?? [];
const dualAt = (structureName: string, roundNumber?: number) =>
  duals().filter((dual) => dual.structureName === structureName && (!roundNumber || dual.roundNumber === roundNumber));

/** score a dual's lines for one side until the dual is decided: the dual's result is a line's call */
function decideByLines(matchUpId: string, winningSide: number) {
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide });
  const dual = () => duals().find((candidate) => candidate.matchUpId === matchUpId);
  for (const line of dual().tieMatchUps) {
    if (dual().winningSide) break;
    tournamentEngine.setMatchUpStatus({ matchUpId: line.matchUpId, drawId: DRAW_ID, outcome });
  }
  expect(dual().winningSide).toEqual(winningSide);
}

function deciderHoldsEachTeamsOwnLineUp(finalWinningSide: number, deciderStatus: string) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawId: DRAW_ID,
        drawType: DOUBLE_ELIMINATION,
        drawSize: 8,
        eventType: TEAM,
        tieFormat: resolveTieFormat('USTA_COLLEGE'),
      },
    ],
    nonRandom: 7001,
    setState: true,
  });
  let result: any = tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: DRAW_ID });
  expect(result.success).toEqual(true);

  for (const [structureName, roundNumber] of ROUNDS)
    for (const dual of dualAt(structureName, roundNumber)) decideByLines(dual.matchUpId, 1);
  const [final] = dualAt('Main', 4);
  decideByLines(final.matchUpId, finalWinningSide);

  const teams: any[] = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  }).participants;
  const teamOf = (participantId: string) =>
    teams.find((team) => team.individualParticipantIds.includes(participantId))?.participantId;

  const [decider] = dualAt('Decider');
  expect(decider.matchUpStatus).toEqual(deciderStatus);
  // the winner first, the loser second
  const finalists = [finalWinningSide, 3 - finalWinningSide].map(
    (sideNumber) => dualAt('Main', 4)[0].sides.find((side: any) => side.sideNumber === sideNumber).participantId,
  );
  expect(decider.sides.map((side: any) => side.participantId)).toEqual(finalists);
  for (const side of decider.sides) {
    // CONTROL: a line-up was carried, so the assertion below is not vacuous
    expect(side.lineUp.length).toBeGreaterThan(0);
    expect([...new Set(side.lineUp.map((member: any) => teamOf(member.participantId)))]).toEqual([side.participantId]);
  }
  // and so no line of the Decider shows one pair on both sides
  for (const line of decider.tieMatchUps) {
    const [first, second] = line.sides.map((side: any) => side.participantId);
    if (first || second) expect(first).not.toEqual(second);
  }
}

// 13 s each under OUTCOME_PIPELINE=differential with coverage; a checkpoint's shard crossed 30 s (#6405)
it.each([
  [1, DEAD_RUBBER],
  [2, TO_BE_PLAYED],
])(
  'the final won by side %s: each side of the Decider holds its own team (%s)',
  { timeout: 180_000 },
  deciderHoldsEachTeamsOwnLineUp,
);

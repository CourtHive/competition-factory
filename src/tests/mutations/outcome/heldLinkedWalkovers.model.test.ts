import { heldLinkedWalkover } from '@Mutate/matchUps/outcome/plan/heldLinkedWalkovers';
import { expect, it } from 'vitest';

// constants and types
import { BYE, COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { LOSER, ROUND_OUTCOME, TOP_DOWN, WINNER } from '@Constants/drawDefinitionConstants';
import type { DrawDefinition, MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { ExitReasonArgs } from '@Mutate/matchUps/outcome/types';
import type { HydratedMatchUp } from '@Types/hydrated';

function match(
  matchUpId: string,
  structureId: string,
  roundNumber: number,
  matchUpStatus: MatchUpStatusUnion,
): HydratedMatchUp {
  return {
    matchUpId,
    structureId,
    roundNumber,
    matchUpStatus,
    roundPosition: 1,
    drawId: 'draw',
    eventId: 'event',
    tournamentId: 'tournament',
  };
}

function claimView(drawDefinition: DrawDefinition, inContextDrawMatchUps: HydratedMatchUp[]): ExitReasonArgs {
  return {
    drawDefinition,
    request: { matchUpId: 'source', flags: { propagateRetirementAsExit: false, propagateExitStatus: true } },
    view: {
      inContextDrawMatchUps,
      targets: { loserTargetSeat: { participantId: 'incoming' } },
    },
  } as ExitReasonArgs;
}

function linkedSeats() {
  return [
    { sideNumber: 1, drawPosition: 5, participantId: 'opponent' },
    { sideNumber: 2, drawPosition: 6, participantId: 'incoming' },
  ];
}

// A director-awarded walkover sends the opponent across a winner link to their assigned position 8.
function singleAward() {
  const linked = match('award', 'back', 1, WALKOVER);
  linked.sides = linkedSeats();
  linked.winningSide = 1;
  const final = match('final', 'main', 2, TO_BE_PLAYED);
  linked.winnerMatchUpId = final.matchUpId;
  final.sides = [{ sideNumber: 2, drawPosition: 8, participantId: 'opponent' }];
  const source = match('source', 'main', 1, COMPLETED);
  const drawDefinition: DrawDefinition = {
    drawId: 'draw',
    structures: [
      { structureId: 'back', finishingPosition: ROUND_OUTCOME },
      {
        structureId: 'main',
        finishingPosition: ROUND_OUTCOME,
        positionAssignments: [{ drawPosition: 8, participantId: 'opponent' }],
      },
    ],
    links: [
      {
        linkType: WINNER,
        source: { structureId: 'back', roundNumber: 1 },
        target: { structureId: 'main', roundNumber: 2, feedProfile: TOP_DOWN },
      },
    ],
  };
  return { linked, source, final, args: claimView(drawDefinition, [source, linked, final]) };
}

// The double exit produces a mark beside the fed BYE, then on the empty side of the next round.
// The other side of that walkover has advanced to the final. The main feeder owns the BYE.
function doubleAward() {
  const linked = match('double', 'back', 1, DOUBLE_WALKOVER);
  linked.sides = linkedSeats();
  const entry = match('bye', 'back', 2, BYE);
  entry.feedRound = true;
  entry.hasFedDrawPosition = true;
  entry.drawPositions = [3];
  const byeSide = { sideNumber: 1, drawPosition: 3, bye: true };
  entry.sides = [byeSide, {}];
  const carried = {
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sourceMatchUpId: linked.matchUpId,
  } as const;
  entry.sideExitProvenance = { 2: carried };
  const relay = match('relay', 'back', 3, WALKOVER);
  relay.sideExitProvenance = { 1: { ...carried } };
  relay.winningSide = 2;
  const earned = { sideNumber: 2, drawPosition: 4, participantId: 'relay-winner' };
  relay.sides = [{}, earned];
  const final = match('final', 'back', 4, TO_BE_PLAYED);
  final.sides = [{ ...earned }];
  linked.winnerMatchUpId = entry.matchUpId;
  entry.winnerMatchUpId = relay.matchUpId;
  relay.winnerMatchUpId = final.matchUpId;
  const source = match('source', 'main', 1, COMPLETED);
  const feeder = match('feeder', 'main', 2, DOUBLE_WALKOVER);
  feeder.loserMatchUpId = entry.matchUpId;
  const byeAssignment = { drawPosition: 3, bye: true, byeFromPropagation: true };
  const drawDefinition: DrawDefinition = {
    drawId: 'draw',
    structures: [
      { structureId: 'back', finishingPosition: ROUND_OUTCOME, positionAssignments: [byeAssignment] },
      { structureId: 'main', finishingPosition: ROUND_OUTCOME },
    ],
    links: [
      {
        linkType: LOSER,
        source: { structureId: 'main', roundNumber: 2 },
        target: { structureId: 'back', roundNumber: 2, feedProfile: TOP_DOWN },
      },
    ],
  };
  const otherQuarter = { ...match('other-quarter', 'back', 1, TO_BE_PLAYED), roundPosition: 2 };
  const otherSemi = { ...match('other-semi', 'back', 2, TO_BE_PLAYED), roundPosition: 2 };
  const otherFeeder = { ...match('other-feeder', 'main', 2, TO_BE_PLAYED), roundPosition: 2 };
  const args = claimView(drawDefinition, [
    otherFeeder,
    linked,
    otherQuarter,
    entry,
    otherSemi,
    relay,
    final,
    source,
    feeder,
  ]);
  return { args, linked, entry, relay, final, source, feeder, byeSide, byeAssignment };
}

type Award = { args: ExitReasonArgs; linked: HydratedMatchUp };
function checkRejection<T extends Award>(model: T, change: (value: T) => void) {
  expect(heldLinkedWalkover(model.args, model.linked)).toBe(true);
  change(model);
  const before = structuredClone(model);
  expect(heldLinkedWalkover(model.args, model.linked)).toBe(false);
  expect(model).toStrictEqual(before);
}

const singleRejections: [string, (value: ReturnType<typeof singleAward>) => void][] = [
  [
    'draw unavailable to resolve the winner link',
    ({ args }) => {
      delete args.drawDefinition;
    },
  ],
  [
    'missing winning side',
    ({ linked }) => {
      delete linked.winningSide;
    },
  ],
  [
    'the source owns an exit on the losing side',
    ({ linked, source }) => {
      linked.sideExitProvenance = {
        2: { sourceMatchUpId: source.matchUpId, previousMatchUpStatus: WALKOVER, matchUpStatus: WALKOVER },
      };
    },
  ],
  [
    'two seats held by the same participant',
    ({ linked }) => {
      linked.sides!.find((seat) => seat.sideNumber === 2)!.participantId = 'opponent';
    },
  ],
  [
    'the incoming loser won the independent award',
    ({ linked }) => {
      linked.winningSide = 2;
    },
  ],
  [
    'the stored target disagrees with the link',
    ({ linked }) => {
      linked.winnerMatchUpId = 'different-final';
    },
  ],
  [
    'the receiving structure has already decided its final',
    ({ final }) => {
      final.matchUpStatus = COMPLETED;
      final.winningSide = 2;
    },
  ],
  [
    'the source itself carries an exit',
    ({ source }) => {
      source.sideExitProvenance = {
        1: { sourceMatchUpId: 'prior', previousMatchUpStatus: WALKOVER, matchUpStatus: WALKOVER },
      };
    },
  ],
];

it.each(singleRejections)('declines an independent walkover when %s', (_reason, change) => {
  checkRejection(singleAward(), change);
});

const doubleRejections: [string, (value: ReturnType<typeof doubleAward>) => void][] = [
  [
    'a stored winner on the double exit',
    ({ linked }) => {
      linked.winningSide = 1;
    },
  ],
  [
    'a loser placement owed by the double exit',
    ({ linked }) => {
      linked.loserMatchUpId = 'loser-receiver';
    },
  ],
  [
    'a winner on the BYE that receives the mark',
    ({ entry }) => {
      entry.winningSide = 1;
    },
  ],
  [
    'a first landing recorded as a played match',
    ({ entry }) => {
      entry.matchUpStatus = COMPLETED;
    },
  ],
  [
    'the fed side no longer holds a BYE',
    ({ byeSide }) => {
      byeSide.bye = false;
    },
  ],
  [
    'a structural BYE in place of the propagated assignment',
    ({ byeAssignment }) => {
      byeAssignment.byeFromPropagation = false;
    },
  ],
  [
    'two feeders claiming the same BYE',
    ({ entry, source }) => {
      source.loserMatchUpId = entry.matchUpId;
    },
  ],
  [
    'the caller itself owes the BYE',
    ({ args, feeder }) => {
      args.request.matchUpId = feeder.matchUpId;
    },
  ],
  [
    'the feeder resolves to a different drawn position',
    ({ entry }) => {
      entry.drawPositions = [7];
    },
  ],
  [
    'an extra mark from the same origin beyond the relay',
    ({ linked, final }) => {
      final.sideExitProvenance = {
        1: { sourceMatchUpId: linked.matchUpId, previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus: WALKOVER },
      };
    },
  ],
];

it.each(doubleRejections)('declines a double-walkover relay with %s', (_reason, change) => {
  checkRejection(doubleAward(), change);
});

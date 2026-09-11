import { getSwapOptions } from '@Query/drawDefinition/avoidance/getSwapOptions';
import { describe, expect, it } from 'vitest';

// Four first-round matches, every one of them holding a same-group pair — the state a playoff
// draw fed by four round-robin groups lands in when the greedy placement pairs each group
// against itself. A collision-free arrangement plainly exists (pair each group's qualifiers
// against a different group), so the repair loop must be able to find a swap.
const GROUP_OF = { 1: 'A', 2: 'A', 3: 'B', 4: 'B', 5: 'C', 6: 'C', 7: 'D', 8: 'D' };

const positionedParticipants = Object.entries(GROUP_OF).map(([drawPosition, group]) => ({
  participantId: `p${drawPosition}-${group}`,
  drawPosition: Number(drawPosition),
  values: [group],
}));

const drawPositionGroups: [number, number][] = [
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
];

const participantAt = (drawPosition: number) =>
  positionedParticipants.find((participant) => participant.drawPosition === drawPosition);

describe('playoff avoidance swap targets', () => {
  it('offers a swap when every first-round pair is a same-group conflict', () => {
    // Every pair conflicts, so the repair loop is choosing among conflicted targets exclusively.
    // Evaluating the swapped-out participant against the pairing it is being moved OUT of would
    // reject all four, leaving the draw with same-group opening matches.
    const avoidanceConflicts = drawPositionGroups.map((pair) => pair.map(participantAt));

    const result: any = getSwapOptions({
      potentialDrawPositions: [1, 2, 3, 4, 5, 6, 7, 8],
      positionedParticipants,
      avoidanceConflicts,
      drawPositionGroups,
      isRoundRobin: false,
    });

    expect(result.length).toBeGreaterThan(0);
  });

  it('never offers a swap that would seat the swapped-out participant against its own group', () => {
    // Four groups of three qualifiers into a 12-draw — the shape when playoff groups take
    // finishing positions [1, 2, 3]. With three members per group the swapped-out participant CAN
    // land against its own group, which is the case the second half of the guard exists to reject.
    const groupOf = {
      1: 'A',
      2: 'A',
      3: 'B',
      4: 'C',
      5: 'A',
      6: 'B',
      7: 'C',
      8: 'D',
      9: 'B',
      10: 'D',
      11: 'C',
      12: 'D',
    };
    const participants = Object.entries(groupOf).map(([drawPosition, group]) => ({
      participantId: `p${drawPosition}-${group}`,
      drawPosition: Number(drawPosition),
      values: [group],
    }));
    const positionGroups: [number, number][] = [
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
      [11, 12],
    ];
    const at = (drawPosition: number) => participants.find((p) => p.drawPosition === drawPosition);

    // Only positions 1 and 2 conflict. Position 5 holds the third group-A qualifier: moving it
    // into position 1 would seat it against the group-A participant at position 2.
    const result: any = getSwapOptions({
      potentialDrawPositions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      avoidanceConflicts: [[at(1), at(2)]],
      positionedParticipants: participants,
      drawPositionGroups: positionGroups,
      isRoundRobin: false,
    });

    const offeredFromPosition1 = result.find((option) => option.drawPosition === 1);
    expect(offeredFromPosition1).toBeDefined();
    expect(offeredFromPosition1.possibleDrawPositions).not.toContain(5);
    // and the guard has not simply rejected everything
    expect(offeredFromPosition1.possibleDrawPositions.length).toBeGreaterThan(0);
  });
});

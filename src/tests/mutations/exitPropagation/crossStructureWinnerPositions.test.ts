import { getDrawDefinition, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const drawId = 'cross-structure';

const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
const find = (k: string) => matchUps().find((m: any) => key(m) === k);
const participantIds = (m: any) => (m.sides ?? []).map((s: any) => s.participantId).filter(Boolean);

function setOutcome(k: string, outcome: any, propagateExitStatus = false) {
  const matchUp = find(k);
  const before = hash(getDrawDefinition(drawId));
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    propagateExitStatus,
    outcome,
    drawId,
  });
  // an error must never be returned over a changed draw
  if (result.error) expect(hash(getDrawDefinition(drawId))).toEqual(before);
  return result;
}

function generate() {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, drawId }],
    setState: true,
  });
}

/** score every playable matchUp in the given structures/rounds, side 1 winning */
function playThrough(keys: (m: any) => boolean) {
  for (let pass = 0; pass < 8; pass++) {
    const playable = matchUps().filter((m: any) => keys(m) && !m.winningSide && participantIds(m).length === 2);
    if (!playable.length) return;
    for (const m of playable) expect(setOutcome(key(m), { winningSide: 1 }).success).toEqual(true);
  }
}

describe('a winner directed across a structure link is placed and removed by its TARGET-structure drawPosition', () => {
  it('removing the Backdraw final result takes its winner back out of the Main final', () => {
    generate();
    playThrough((m) => !(m.structureName === 'Main' && m.roundNumber === 4) && m.structureName !== 'Decider');

    const backdrawFinal = find('Backdraw|4|1');
    const backdrawWinnerId = participantIds(backdrawFinal)[0];
    expect(backdrawFinal.winningSide).toEqual(1);
    expect(participantIds(find('Main|4|1'))).toContain(backdrawWinnerId);

    expect(
      setOutcome('Backdraw|4|1', { winningSide: undefined, score: undefined, matchUpStatus: 'TO_BE_PLAYED' }).success,
    ).toEqual(true);

    const mainFinal = find('Main|4|1');
    expect(participantIds(mainFinal)).not.toContain(backdrawWinnerId);
    expect(mainFinal.drawPositions?.filter(Boolean).length).toEqual(1);

    // the OTHER Backdraw finalist can now win and take the slot
    const result = setOutcome('Backdraw|4|1', { winningSide: 2 });
    expect(result.error).toBeUndefined();
    const newWinnerId = participantIds(find('Backdraw|4|1'))[1];
    expect(participantIds(find('Main|4|1'))).toContain(newWinnerId);
    expect(participantIds(find('Main|4|1'))).not.toContain(backdrawWinnerId);
  });

  it('flipping the Backdraw final winner replaces its winner in the Main final', () => {
    generate();
    playThrough((m) => !(m.structureName === 'Main' && m.roundNumber === 4) && m.structureName !== 'Decider');

    const [side1Id, side2Id] = participantIds(find('Backdraw|4|1'));
    expect(setOutcome('Backdraw|4|1', { winningSide: 2 }).error).toBeUndefined();
    expect(participantIds(find('Main|4|1'))).toContain(side2Id);
    expect(participantIds(find('Main|4|1'))).not.toContain(side1Id);
  });
});

/**
 * Census reproductions, shrunk. `nonRandom` and `participantsCount` are load-bearing: BYE placement
 * is decided at generation, and two of these turn on it.
 */
describe('census reproductions — cross-structure advancement never refuses over a changed draw', () => {
  type Submission = [structureName: string, roundNumber: number, roundPosition: number, outcome: any];
  const CASES: {
    name: string;
    participantsCount: number;
    nonRandom: number;
    allowChangePropagation?: boolean;
    submissions: Submission[];
  }[] = [
    {
      name: 'census 9000402 — Backdraw final winner flipped',
      participantsCount: 4,
      nonRandom: 9000402,
      submissions: [
        ['Main', 2, 1, { matchUpStatus: 'WALKOVER', winningSide: 1 }],
        ['Main', 2, 2, { winningSide: 1 }],
        ['Main', 3, 1, { winningSide: 1 }],
        ['Backdraw', 4, 1, { winningSide: 2 }],
        ['Backdraw', 4, 1, { winningSide: 1 }],
      ],
    },
    {
      name: 'census 9000196 — Main semifinal re-scored with the same winner over a pending exit',
      participantsCount: 4,
      nonRandom: 9000196,
      allowChangePropagation: true,
      submissions: [
        ['Main', 2, 1, { winningSide: 2 }],
        ['Main', 2, 2, { winningSide: 2 }],
        ['Main', 3, 1, { winningSide: 1 }],
        ['Backdraw', 4, 1, { matchUpStatus: DOUBLE_WALKOVER }],
        ['Main', 3, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ],
    },
    {
      // census 9100555's opening, then the Backdraw semifinal is CLEARED: its winner had passed
      // through the Backdraw final's BYE into the Main final, and must come back out of both
      name: 'a Backdraw semifinal result removed takes its winner back out of the Main final',
      participantsCount: 6,
      nonRandom: 9100555,
      submissions: [
        ['Main', 1, 2, { winningSide: 2 }],
        ['Main', 1, 3, { winningSide: 2 }],
        ['Main', 2, 2, { matchUpStatus: 'DOUBLE_DEFAULT' }],
        ['Main', 2, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
        ['Backdraw', 3, 1, { winningSide: 2 }],
        ['Backdraw', 3, 1, { matchUpStatus: 'TO_BE_PLAYED', winningSide: undefined, score: undefined }],
        ['Backdraw', 3, 1, { winningSide: 1 }],
      ],
    },
    {
      name: 'census 9100555, flag ON — a Main first-round flip relabels the Backdraw champion re-entering Main',
      participantsCount: 6,
      nonRandom: 9100555,
      allowChangePropagation: true,
      submissions: [
        ['Main', 2, 2, { matchUpStatus: 'DOUBLE_DEFAULT' }],
        ['Main', 1, 2, { winningSide: 1 }],
        ['Main', 1, 3, { winningSide: 1 }],
        ['Main', 2, 1, { matchUpStatus: 'WALKOVER', winningSide: 2 }],
        ['Backdraw', 3, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
        ['Main', 1, 3, { matchUpStatus: 'WALKOVER', winningSide: 2 }],
        ['Backdraw', 3, 1, { winningSide: 1 }],
      ],
    },
    {
      // unwinding a Backdraw double walkover asked which Backdraw-final positions the Main final
      // held, by NUMBER: Backdraw 1 (a BYE) matched Main 1 (the Main-draw winner), who was removed
      name: 'census 9100555 — unwinding a Backdraw double exit leaves the Main-draw winner in the Main final',
      participantsCount: 6,
      nonRandom: 9100555,
      submissions: [
        ['Main', 1, 2, { winningSide: 2 }],
        ['Main', 2, 2, { matchUpStatus: 'DOUBLE_DEFAULT' }],
        ['Main', 2, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
        ['Backdraw', 3, 1, { matchUpStatus: DOUBLE_WALKOVER }],
        ['Main', 1, 3, { matchUpStatus: 'WALKOVER', winningSide: 2 }],
        ['Backdraw', 3, 1, { winningSide: 1 }],
      ],
    },
    {
      // the Main-draw winner reached the Decider through the Main final's pending walkover; flipping
      // the Main semifinal took them out of the Main final but left them ASSIGNED in the Decider
      name: 'DE window seed 9301605 — a flipped Main semifinal winner leaves the Decider too',
      participantsCount: 4,
      nonRandom: 9301605,
      submissions: [
        ['Main', 2, 1, { winningSide: 1 }],
        ['Backdraw', 3, 1, { matchUpStatus: 'DOUBLE_DEFAULT' }],
        ['Main', 2, 2, { winningSide: 2 }],
        ['Main', 3, 1, { matchUpStatus: 'WALKOVER', winningSide: 1 }],
        ['Main', 3, 1, { winningSide: 2 }],
      ],
    },
    {
      name: 'census 9100555 — Backdraw semifinal winner advances through a BYE into the Main final',
      participantsCount: 6,
      nonRandom: 9100555,
      submissions: [
        ['Main', 1, 2, { winningSide: 2 }],
        ['Main', 1, 3, { winningSide: 2 }],
        ['Main', 2, 2, { matchUpStatus: 'DOUBLE_DEFAULT' }],
        ['Main', 2, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
        ['Main', 2, 1, { matchUpStatus: 'WALKOVER', winningSide: 2 }],
        ['Backdraw', 2, 1, { winningSide: 1 }],
        ['Backdraw', 3, 1, { winningSide: 1 }],
      ],
    },
  ];

  it.each(CASES)('$name', ({ participantsCount, nonRandom, allowChangePropagation, submissions }) => {
    setSubscriptions({});
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount, drawId }],
      setState: true,
      nonRandom,
    });

    for (const [index, [structureName, roundNumber, roundPosition, outcome]] of submissions.entries()) {
      const step = `step ${index + 1} ${structureName}|${roundNumber}|${roundPosition}`;
      const matchUp = find(`${structureName}|${roundNumber}|${roundPosition}`);
      const before = hash(getDrawDefinition(drawId));
      const result: any = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        propagateExitStatus: true,
        allowChangePropagation,
        outcome,
        drawId,
      });
      // checked per step: a later step can overwrite the damage an earlier one did
      if (result.error) expect(hash(getDrawDefinition(drawId)), `${step} ${result.error.code}`).toEqual(before);
      const integrity: any = tournamentEngine.getDrawInconsistencies({ drawId });
      expect(integrity.inconsistencies ?? [], step).toEqual([]);

      // the Decider is fed by the Main final alone: nobody can be assigned there who is not in it
      const mainFinalIds = participantIds(find('Main|4|1'));
      const deciderIds = (
        getDrawDefinition(drawId).structures.find((s: any) => s.structureName === 'Decider')?.positionAssignments ?? []
      )
        .map((assignment: any) => assignment.participantId)
        .filter(Boolean);
      for (const participantId of deciderIds) expect(mainFinalIds, `${step} Decider`).toContain(participantId);
    }
  });
});

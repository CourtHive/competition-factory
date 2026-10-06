import { getDrawDefinition, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { BYE, COMPLETED, DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
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
    /** the step numbers (1-based) refused by ruling; any other refusal fails the case */
    refusals?: number[];
    /** the shape the case pins: after step `after`, each matchUp holds the status given */
    reaches?: { after: number; statuses: Record<string, string> }[];
  }[] = [
    // REFUSED STEPS (CA, 2026-10-04: a direct double exit needs both seats reached; 2026-10-03: a carried exit is
    // not re-scored where it landed). A refused step leaves the draw unchanged, which hollowed these cases out after
    // #5154(factory): they kept passing without reaching the shapes they were written to pin. Every refusal a case
    // expects is now DECLARED in `refusals` and asserted, so an undeclared one fails; and each rebuilt case asserts
    // the shape it pins (`reaches`). Rebuilt 2026-10-06 on legal steps, each double exit entered with both seats
    // reached: 9000196, 9100555 flag ON, 9100555 (Backdraw double exit, as its own case), 9301605, and the last case,
    // whose step re-scoring a carried walkover is gone.
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
      // The census's exit was PENDING: its double exit was entered beside an unreached seat. Entered legally, the
      // Backdraw final's second seat is the Main semifinal's loser, so the semifinal is decided first and its winner
      // already stands in the Main final: the produced exit lands awarded, never pending, on legal steps here.
      name: 'census 9000196 — Main semifinal re-scored with the same winner over the exit its loser produced',
      participantsCount: 4,
      nonRandom: 9000196,
      allowChangePropagation: true,
      submissions: [
        ['Main', 2, 1, { winningSide: 2 }],
        ['Main', 2, 2, { winningSide: 2 }],
        ['Main', 3, 1, { winningSide: 1 }],
        ['Backdraw', 3, 1, { winningSide: 1 }],
        ['Backdraw', 4, 1, { matchUpStatus: DOUBLE_WALKOVER }],
        ['Main', 3, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ],
      reaches: [{ after: 5, statuses: { 'Backdraw|4|1': DOUBLE_WALKOVER, 'Main|4|1': WALKOVER } }],
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
        ['Main', 1, 2, { winningSide: 1 }],
        ['Main', 1, 3, { winningSide: 1 }],
        ['Main', 2, 2, { matchUpStatus: 'DOUBLE_DEFAULT' }],
        ['Main', 2, 1, { matchUpStatus: 'WALKOVER', winningSide: 2 }],
        ['Backdraw', 3, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
        ['Main', 1, 3, { matchUpStatus: 'WALKOVER', winningSide: 2 }],
        ['Backdraw', 3, 1, { winningSide: 1 }],
      ],
      reaches: [
        { after: 5, statuses: { 'Backdraw|3|1': DEFAULTED, 'Backdraw|4|1': BYE } },
        { after: 7, statuses: { 'Backdraw|3|1': COMPLETED, 'Backdraw|4|1': BYE } },
      ],
    },
    {
      // unwinding a Backdraw double walkover asked which Backdraw-final positions the Main final
      // held, by NUMBER: Backdraw 1 (a BYE) matched Main 1 (the Main-draw winner), who was removed.
      // Since CA's 2026-10-04 ruling steps 2 and 4 are REFUSED, unchanged: each is a direct double exit
      // on a matchUp holding one participant beside a seat nobody has reached, and a direct double exit
      // needs both. Those steps set up F3's dropped convergence; `aDirectDoubleExitNeedsBothSeats.test.ts`
      // pins the refusal.
      name: 'census 9100555 — a Backdraw double exit beside an unreached seat is refused; the Main-draw winner stays in the Main final',
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
      refusals: [2, 4, 6],
    },
    {
      // the same shape on legal steps: the Backdraw double walkover entered with both seats reached, beside the
      // Backdraw final's BYE at drawPosition 1 while the Main final holds the Main-draw winner on drawPosition 1
      name: 'census 9100555 on legal steps — unwinding a Backdraw double walkover keeps the Main-draw winner in the Main final',
      participantsCount: 6,
      nonRandom: 9100555,
      submissions: [
        ['Main', 1, 2, { winningSide: 2 }],
        ['Main', 1, 3, { winningSide: 2 }],
        ['Main', 2, 2, { matchUpStatus: 'DOUBLE_DEFAULT' }],
        ['Main', 2, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }],
        ['Backdraw', 3, 1, { matchUpStatus: DOUBLE_WALKOVER }],
        ['Main', 1, 3, { matchUpStatus: 'WALKOVER', winningSide: 2 }],
        ['Backdraw', 3, 1, { winningSide: 1 }],
      ],
      reaches: [
        { after: 5, statuses: { 'Backdraw|3|1': DOUBLE_WALKOVER, 'Backdraw|4|1': BYE, 'Main|4|1': WALKOVER } },
        { after: 7, statuses: { 'Backdraw|3|1': COMPLETED, 'Main|4|1': TO_BE_PLAYED } },
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
        ['Main', 2, 2, { winningSide: 2 }],
        ['Backdraw', 3, 1, { matchUpStatus: 'DOUBLE_DEFAULT' }],
        ['Main', 3, 1, { matchUpStatus: 'WALKOVER', winningSide: 1 }],
        ['Main', 3, 1, { winningSide: 2 }],
      ],
      reaches: [{ after: 4, statuses: { 'Main|4|1': WALKOVER, 'Decider|1|1': BYE } }],
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
        ['Backdraw', 3, 1, { winningSide: 1 }],
      ],
      reaches: [{ after: 6, statuses: { 'Backdraw|3|1': COMPLETED, 'Backdraw|4|1': BYE } }],
    },
  ];

  it.each(CASES)(
    '$name',
    ({ participantsCount, nonRandom, allowChangePropagation, submissions, refusals, reaches }) => {
      setSubscriptions({});
      mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount, drawId }],
        setState: true,
        nonRandom,
      });

      const refused: number[] = [];
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
        if (result.error) refused.push(index + 1);
        for (const [shapeKey, matchUpStatus] of Object.entries(
          reaches?.find(({ after }) => after === index + 1)?.statuses ?? {},
        )) {
          expect(find(shapeKey)?.matchUpStatus, `${step} reaches ${shapeKey}`).toEqual(matchUpStatus);
        }
        const integrity: any = tournamentEngine.getDrawInconsistencies({ drawId });
        // ERRORS only, for the reason `hasErrorSeverity` documents: `STALLED_POSITION` is advisory, and
        // this per-step assertion is about structural soundness. One stall DOES occur here and it is
        // tracked rather than dropped: census 9100555's transient inside a correction sequence. DE
        // window 9301605 was the second, punch-list **P40**, and it is closed —
        // `reconcileStaleExitOrigins` withdraws the carried exit whose origin stopped being a double
        // exit, and `staleExitOriginReconciliation.test.ts` asserts that sequence reports NOTHING at any
        // severity.
        expect(
          (integrity.inconsistencies ?? []).filter((i: any) => i.severity === 'error'),
          step,
        ).toEqual([]);

        // the Decider is fed by the Main final alone: nobody can be assigned there who is not in it
        const mainFinalIds = participantIds(find('Main|4|1'));
        const deciderIds = (
          getDrawDefinition(drawId).structures.find((s: any) => s.structureName === 'Decider')?.positionAssignments ??
          []
        )
          .map((assignment: any) => assignment.participantId)
          .filter(Boolean);
        for (const participantId of deciderIds) expect(mainFinalIds, `${step} Decider`).toContain(participantId);
      }
      expect(refused).toEqual(refusals ?? []);
    },
  );
});

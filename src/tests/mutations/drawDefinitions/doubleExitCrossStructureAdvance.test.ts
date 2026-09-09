/**
 * Regression cover for the partial mutation that started this workstream.
 *
 * Applying a DOUBLE_WALKOVER to a DOUBLE_ELIMINATION Backdraw final returned
 * ERR_EXISTING_POSITION_ASSIGNMENT **after writing four structures** — the Main final, the source
 * matchUp, a BYE into the Decider, and the Decider matchUp. An error over already-mutated state
 * means the caller sees a failure while the draw has already changed.
 *
 * The error message was also misleading. Measured at the refusal:
 *
 *     target Decider r1p1, existing drawPositions [1, 2], requested drawPosition 3
 *
 * The Decider holds drawPositions 1 and 2 — its OWN position space. drawPosition 3 is a Main-draw
 * position, so this is not an occupied slot but a FOREIGN one, and `assignMatchUpDrawPosition` has
 * no vocabulary for that. Cross-structure progression is the link's job; it now goes through
 * `directWinner` like any other linked advancement.
 *
 * NOTE the retry half of the original finding is already fixed: the quarantine reference said "a
 * retry errors AND mutates again", and by the time this was picked up the idempotence guard from
 * #4782 had made the retry a clean no-op. Only the partial mutation survived.
 */
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { hash, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { firstPlayable, nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

describe.each([
  [DOUBLE_WALKOVER, 67],
  [DOUBLE_DEFAULT, 69],
])('DOUBLE_ELIMINATION 8/8 — %s cascade reaching the Decider', (exitStatus: any, seed: any) => {
  it('never returns an error over an already-mutated draw', () => {
    setSubscriptions({});
    const drawId = `cross-structure-${exitStatus}`;
    const outcome = { matchUpStatus: exitStatus };

    const { drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 8 }],
      nonRandom: seed,
      setState: true,
    });
    expect(drawIds).toContain(drawId);

    // the schedule the exit-propagation matrix drives: one planted exit, then forward with a
    // periodic exit, which is what reaches the Backdraw final while the Decider is half-filled
    const lead = nextPlayable(drawId);
    tournamentEngine.setMatchUpStatus({ propagateExitStatus: true, matchUpId: lead.matchUpId, drawId, outcome });

    const skip = new Set<string>();
    const errorsOverMutation: string[] = [];
    let steps = 0;

    for (let taken = 0; taken < 200; taken++) {
      const target = firstPlayable(getDrawMatchUps(drawId), skip);
      if (!target) break;
      steps++;
      const applied = taken % 3 === 2 ? outcome : { winningSide: 1 };

      const before = hash(getDrawDefinition(drawId));
      const result: any = tournamentEngine.setMatchUpStatus({
        propagateExitStatus: true,
        matchUpId: target.matchUpId,
        drawId,
        outcome: applied,
      });
      const after = hash(getDrawDefinition(drawId));

      if (result?.error && before !== after) {
        errorsOverMutation.push(
          `${target.structureName} r${target.roundNumber}p${target.roundPosition}: ` +
            `${JSON.stringify(result.error)} returned after mutating the draw`,
        );
      }
      if (result?.error) skip.add(target.matchUpId);
    }

    // CONTROL: a schedule that stopped immediately would satisfy the assertion vacuously
    expect(steps).toBeGreaterThan(5);
    expect(errorsOverMutation).toEqual([]);

    // and the draw the cascade produced is whole, not merely error-free
    const drawDefinition = getDrawDefinition(drawId);
    const integrity: any = getDrawInconsistencies({ drawDefinition, drawId });
    expect(integrity.inconsistencies).toEqual([]);
  });
});

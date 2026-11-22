import { heldLoserByeClaims } from '@Mutate/matchUps/outcome/plan/heldLoserBye';
import { planDirection } from '@Mutate/matchUps/outcome/direction';
import { buildOutcomeView } from '@Mutate/matchUps/outcome/view';
import { chooseRoute } from '@Mutate/matchUps/outcome/route';
import { expect } from 'vitest';

import type { OutcomeRequest } from '@Mutate/matchUps/outcome/types';
import type { RecordedCall } from './recordedCallHarness';

/** Build the actual planner input. Each counterexample changes one claim in its own copy of the draw or its projected seats. */
function model(call: RecordedCall) {
  const tournamentRecord = structuredClone(call.prepared);
  const event = tournamentRecord.events![0];
  const drawDefinition = event.drawDefinitions![0];
  const request: OutcomeRequest = {
    ...(call.params.outcome as Pick<OutcomeRequest, 'matchUpStatus' | 'score' | 'winningSide'>),
    matchUpId: call.params.matchUpId as string,
    flags: { propagateExitStatus: true, propagateRetirementAsExit: false },
  };
  const view = buildOutcomeView({ tournamentRecord, event, drawDefinition, request });
  const route = chooseRoute(request, view);
  const direction = planDirection(request, view, route);
  const structure = (name: string) => drawDefinition.structures!.find((s) => s.structureName === name)!;
  const at = (name: string, round: number, position = 1) =>
    view.inContextDrawMatchUps!.find(
      (m) => m.structureId === structure(name).structureId && m.roundNumber === round && m.roundPosition === position,
    )!;
  return {
    structure,
    at,
    drawDefinition,
    accepts: () => heldLoserByeClaims({ drawDefinition, request, view, route, direction }),
  };
}

export function checkHeldByeClaims(
  call: RecordedCall,
  changes: Record<string, (claim: ReturnType<typeof model>) => void>,
) {
  expect(model(call).accepts(), 'the unchanged claim').toBe(true);
  for (const [description, change] of Object.entries(changes)) {
    const claim = model(call);
    change(claim);
    expect(claim.accepts(), description).toBe(false);
  }
}

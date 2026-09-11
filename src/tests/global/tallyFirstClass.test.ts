/**
 * CODES Phase 1 — first-class promotion of `tally` and `subOrder` on
 * positionAssignments. Verifies writers and readers behave consistently
 * across all three schemaWriteMode values when run end-to-end against a
 * round-robin tournament whose matchUps are completed through the engine
 * (so updateAssignmentParticipantResults actually fires).
 *
 * The existing test fleet keeps its LEGACY assertions (see
 * setSchemaWriteModeLegacy.ts) — these tests own the new behavior.
 */
import { describe, expect, it } from 'vitest';

import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { setSchemaWriteMode } from '@Global/state/globalState';
import { findExtension } from '@Acquire/findExtension';
import tournamentEngine from '../engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { BRIDGE, LEGACY, NATIVE, SchemaWriteMode } from '@Constants/schemaWriteModeConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { TALLY } from '@Constants/extensionConstants';
import { SINGLES } from '@Constants/eventConstants';

function buildCompletedRRTournament(mode: SchemaWriteMode) {
  setSchemaWriteMode(mode);

  // Deterministic outcomes (same as roundRobinTallyPolicy.test.ts) so each
  // mode produces an identical record shape we can compare across modes.
  const drawProfiles = [
    {
      drawSize: 4,
      drawType: ROUND_ROBIN,
      eventType: SINGLES,
      outcomes: [
        { drawPositions: [1, 2], scoreString: '6-3 6-3', winningSide: 1 },
        { drawPositions: [1, 3], scoreString: '6-3 6-3', winningSide: 1 },
        { drawPositions: [1, 4], scoreString: '6-3 6-3', winningSide: 1 },
        { drawPositions: [2, 3], scoreString: '6-3 6-3', winningSide: 1 },
        { drawPositions: [2, 4], scoreString: '6-3 6-3', winningSide: 1 },
        { drawPositions: [3, 4], scoreString: '6-3 6-3', winningSide: 1 },
      ],
    },
  ];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles });
  tournamentEngine.setState(tournamentRecord);

  const drawId = tournamentRecord.events[0].drawDefinitions[0].drawId;
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  // RR draws nest the group structures under a CONTAINER top-level structure.
  const containerStructure = drawDefinition.structures[0];
  const groupStructure = containerStructure.structures[0];
  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    drawId,
    structureId: groupStructure.structureId,
  });

  return { drawId, positionAssignments };
}

describe('NATIVE mode — tally', () => {
  it('writes tally as a first-class attribute and leaves no legacy extension', () => {
    const { positionAssignments } = buildCompletedRRTournament(NATIVE);
    const tallied = positionAssignments.filter((pa: any) => pa.tally);
    expect(tallied.length).toBeGreaterThan(0);

    for (const assignment of tallied) {
      expect(assignment.tally).toEqual(expect.any(Object));
      expect(typeof assignment.tally.matchUpsWon).toEqual('number');
      const { extension } = findExtension({ element: assignment, name: TALLY });
      expect(extension).toBeUndefined();
    }
  });
});

describe('LEGACY mode — tally', () => {
  it('writes tally only as a legacy extension; no first-class attribute', () => {
    const { positionAssignments } = buildCompletedRRTournament(LEGACY);
    const withExtension = positionAssignments.filter(
      (pa: any) => findExtension({ element: pa, name: TALLY }).extension !== undefined,
    );
    expect(withExtension.length).toBeGreaterThan(0);

    for (const assignment of withExtension) {
      const { extension } = findExtension({ element: assignment, name: TALLY });
      expect(extension?.value).toEqual(expect.any(Object));
      expect(typeof extension?.value.matchUpsWon).toEqual('number');
      expect(assignment.tally).toBeUndefined();
    }
  });
});

describe('BRIDGE mode — tally', () => {
  it('writes tally to both the first-class attribute and the legacy extension', () => {
    const { positionAssignments } = buildCompletedRRTournament(BRIDGE);
    const dualWrites = positionAssignments.filter(
      (pa: any) => pa.tally && findExtension({ element: pa, name: TALLY }).extension !== undefined,
    );
    expect(dualWrites.length).toBeGreaterThan(0);

    for (const assignment of dualWrites) {
      const { extension } = findExtension({ element: assignment, name: TALLY });
      expect(assignment.tally).toEqual(extension?.value);
    }
  });
});

describe('Read symmetry — firstClassOrExtension yields equivalent tallies in every mode', () => {
  it.each([NATIVE, BRIDGE, LEGACY] as SchemaWriteMode[])('mode=%s', (mode) => {
    const { positionAssignments } = buildCompletedRRTournament(mode);

    const collected = positionAssignments
      .map((assignment: any) => {
        const tally = firstClassOrExtension({ element: assignment, attribute: 'tally', name: TALLY });
        return tally
          ? {
              participantId: assignment.participantId,
              drawPosition: assignment.drawPosition,
              groupOrder: tally.groupOrder,
              matchUpsLost: tally.matchUpsLost,
              matchUpsWon: tally.matchUpsWon,
            }
          : null;
      })
      .filter(Boolean);

    expect(collected.length).toEqual(4);
    // With deterministic outcomes, drawPosition 1 wins all 3, drawPosition 4
    // loses all 3 — same finishing order regardless of write mode.
    const byDrawPosition = Object.fromEntries(collected.map((row: any) => [row.drawPosition, row]));
    expect(byDrawPosition[1].matchUpsWon).toEqual(3);
    expect(byDrawPosition[1].matchUpsLost).toEqual(0);
    expect(byDrawPosition[4].matchUpsWon).toEqual(0);
    expect(byDrawPosition[4].matchUpsLost).toEqual(3);
  });
});

// NOTE: engine-level setSubOrder() in a non-tied bracket would immediately be
// cleared by the downstream updateAssignmentParticipantResults pass (it removes
// SUB_ORDER when a participantResult has no `ties`). The routing through
// setFirstClassOrExtension is covered transitively by:
//   - Phase 0's schemaWriteMode.test.ts (helper routing)
//   - The existing roundRobinTally.test.ts (engine setSubOrder in a tied scenario)
// so no additional setSubOrder tests are required at this layer.

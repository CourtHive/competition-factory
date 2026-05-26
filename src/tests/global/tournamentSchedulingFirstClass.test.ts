/**
 * CODES Phase 5 — tournamentRecord.scheduling group leaf.
 *
 * Three previously-separate tournament-level extensions collapse onto a
 * single first-class object:
 *
 *   - `SCHEDULING_PROFILE`  → tournamentRecord.scheduling.profile
 *   - `SCHEDULE_LIMITS`     → tournamentRecord.scheduling.dailyLimits
 *   - `SCHEDULE_TIMING`     → tournamentRecord.scheduling.timing
 *
 * `SCHEDULE_TIMING` is also used at the event level (per-event matchUpFormat
 * timing) — that promotion is NOT in Phase 5 scope and remains an extension
 * on the Event entity.
 */
import { describe, expect, it } from 'vitest';

import { firstClassGroupLeafOrExtension, setGroupLeafOrExtension } from '@Mutate/extensions/setGroupLeafOrExtension';
import { setSchemaWriteMode } from '@Global/state/globalState';
import { findExtension } from '@Acquire/findExtension';

// constants and types
import { DUAL, LEGACY, NATIVE, SchemaWriteMode } from '@Constants/schemaWriteModeConstants';
import { SCHEDULE_LIMITS, SCHEDULE_TIMING, SCHEDULING_PROFILE } from '@Constants/extensionConstants';

type Promotion = { name: string; leaf: string; value: any };

const promotions: Promotion[] = [
  { name: SCHEDULING_PROFILE, leaf: 'profile', value: [{ scheduleDate: '2026-01-05', venues: [] }] },
  { name: SCHEDULE_LIMITS, leaf: 'dailyLimits', value: { dailyLimits: { default: 3 } } },
  {
    name: SCHEDULE_TIMING,
    leaf: 'timing',
    value: { matchUpAverageTimes: [{ matchUpFormat: 'SET3-S:6/TB7', minutes: 60 }] },
  },
];

describe.each([NATIVE, DUAL, LEGACY] as SchemaWriteMode[])('scheduling group-leaf routing (mode=%s)', (mode) => {
  it.each(promotions)('$leaf routes correctly', ({ name, leaf, value }) => {
    setSchemaWriteMode(mode);
    const tournamentRecord: any = { tournamentId: 't1' };

    setGroupLeafOrExtension({
      element: tournamentRecord,
      groupAttribute: 'scheduling',
      leafAttribute: leaf,
      name,
      value,
    });

    const fc = tournamentRecord.scheduling?.[leaf];
    const ext = findExtension({ element: tournamentRecord, name }).extension;
    if (mode === NATIVE) {
      expect(fc).toEqual(value);
      expect(ext).toBeUndefined();
    } else if (mode === DUAL) {
      expect(fc).toEqual(value);
      expect(ext?.value).toEqual(value);
    } else {
      expect(tournamentRecord.scheduling).toBeUndefined();
      expect(ext?.value).toEqual(value);
    }
  });
});

describe('Read symmetry — firstClassGroupLeafOrExtension', () => {
  it.each(promotions)('mode-agnostic read for $leaf', ({ name, leaf, value }) => {
    for (const mode of [NATIVE, DUAL, LEGACY] as SchemaWriteMode[]) {
      setSchemaWriteMode(mode);
      const tournamentRecord: any = { tournamentId: 't1' };
      setGroupLeafOrExtension({
        element: tournamentRecord,
        groupAttribute: 'scheduling',
        leafAttribute: leaf,
        name,
        value,
      });
      const read = firstClassGroupLeafOrExtension({
        element: tournamentRecord,
        groupAttribute: 'scheduling',
        leafAttribute: leaf,
        name,
      });
      expect(read).toEqual(value);
    }
  });
});

describe('Group bookkeeping', () => {
  it('removes the group when the last leaf is cleared (NATIVE)', () => {
    setSchemaWriteMode(NATIVE);
    const tournamentRecord: any = { tournamentId: 't1' };
    setGroupLeafOrExtension({
      element: tournamentRecord,
      groupAttribute: 'scheduling',
      leafAttribute: 'profile',
      name: SCHEDULING_PROFILE,
      value: [{ scheduleDate: '2026-01-05', venues: [] }],
    });
    expect(tournamentRecord.scheduling?.profile).toBeDefined();

    setGroupLeafOrExtension({
      element: tournamentRecord,
      groupAttribute: 'scheduling',
      leafAttribute: 'profile',
      name: SCHEDULING_PROFILE,
      value: undefined,
    });
    expect(tournamentRecord.scheduling).toBeUndefined();
  });

  it('keeps the group when other leaves are still present (NATIVE)', () => {
    setSchemaWriteMode(NATIVE);
    const tournamentRecord: any = { tournamentId: 't1' };
    setGroupLeafOrExtension({
      element: tournamentRecord,
      groupAttribute: 'scheduling',
      leafAttribute: 'profile',
      name: SCHEDULING_PROFILE,
      value: [{ scheduleDate: '2026-01-05', venues: [] }],
    });
    setGroupLeafOrExtension({
      element: tournamentRecord,
      groupAttribute: 'scheduling',
      leafAttribute: 'dailyLimits',
      name: SCHEDULE_LIMITS,
      value: { dailyLimits: { default: 3 } },
    });

    // Clear profile
    setGroupLeafOrExtension({
      element: tournamentRecord,
      groupAttribute: 'scheduling',
      leafAttribute: 'profile',
      name: SCHEDULING_PROFILE,
      value: undefined,
    });
    expect(tournamentRecord.scheduling?.dailyLimits).toEqual({ dailyLimits: { default: 3 } });
    expect(tournamentRecord.scheduling?.profile).toBeUndefined();
  });
});

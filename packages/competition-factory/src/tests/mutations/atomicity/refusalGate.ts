import { setOutcomePipeline, setSchemaWriteMode } from '@Global/state/globalState';
import { captureNotices } from '../notifications/noticeConformance/harness';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import { expect } from 'vitest';

export const OUTCOME_MODES = ['v1', 'v2', 'differential'] as const;
export type Directive = { method: string; params: any };
export type RefusalCase = { directive: Directive; code: string; writeMode?: any; initial: any };

const records = () => tournamentEngine.getState().tournamentRecords;

/**
 * The refusal-atomicity gate for one refused public call, in one outcome pipeline: the direct call and the rollback-off
 * queue each return `code`, leave the complete stored record unchanged (stamps included, absent properties absent) and
 * publish nothing. With `borrowed`, the record is installed with `setState(record, false)`: the caller's own plain
 * objects stay what they were, and the engine keeps holding them.
 */
export function expectRefusalLeavesRecord({ directive, code, writeMode, initial }: RefusalCase, borrowed: boolean) {
  setSchemaWriteMode(writeMode);
  try {
    for (const call of ['direct', 'queue'] as const) {
      const record = structuredClone(initial);
      tournamentEngine.reset();
      expect(tournamentEngine.setState(record, !borrowed).success).toBe(true);
      const held = records();
      const before = canonicalJson(held);
      const notices = captureNotices(() => {
        const params = structuredClone(directive.params);
        const result: any =
          call === 'direct'
            ? tournamentEngine[directive.method](params)
            : tournamentEngine.executionQueue([{ method: directive.method, params }], false);
        expect(result.error?.code ?? result.error).toEqual(code);
      });
      expect(canonicalJson(records())).toBe(before);
      expect(notices).toEqual([]);
      if (borrowed) {
        expect(Object.values(records())[0]).toBe(record);
        expect(canonicalJson(record)).toBe(canonicalJson(initial));
      }
      expect(Object.keys(held)).toEqual(Object.keys(records()));
    }
  } finally {
    setSchemaWriteMode();
  }
}

export function withPipeline(mode: (typeof OUTCOME_MODES)[number], run: () => void) {
  setOutcomePipeline(mode);
  try {
    run();
  } finally {
    setOutcomePipeline();
  }
}

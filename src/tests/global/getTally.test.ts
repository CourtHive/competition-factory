import { describe, expect, it } from 'vitest';

import { setSchemaWriteMode } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';

// constants and types
import { LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';

const TALLY_VALUE = { groupOrder: 1, rankOrder: 2, MPctSum: 0.5 };

describe('getTally — mode-agnostic positionAssignment.tally read', () => {
  it('returns NOT_FOUND when no tally is present', () => {
    const result: any = tournamentEngine.getTally({ positionAssignment: { drawPosition: 1 } });
    expect(result.error).toBeDefined();
    expect(result.tally).toBeUndefined();
  });

  it('returns MISSING_POSITION_ASSIGNMENTS when positionAssignment is missing', () => {
    const result: any = tournamentEngine.getTally({});
    expect(result.error).toBeDefined();
  });

  it('reads first-class pa.tally when NATIVE-written', () => {
    setSchemaWriteMode(NATIVE);
    const result: any = tournamentEngine.getTally({
      positionAssignment: { drawPosition: 1, tally: TALLY_VALUE },
    });
    expect(result.tally).toEqual(TALLY_VALUE);
  });

  it('reads legacy extension when LEGACY-written', () => {
    setSchemaWriteMode(LEGACY);
    const result: any = tournamentEngine.getTally({
      positionAssignment: {
        drawPosition: 1,
        extensions: [{ name: 'tally', value: TALLY_VALUE }],
      },
    });
    expect(result.tally).toEqual(TALLY_VALUE);
  });

  it('first-class wins when both are present (DUAL-written record)', () => {
    setSchemaWriteMode(NATIVE);
    const result: any = tournamentEngine.getTally({
      positionAssignment: {
        drawPosition: 1,
        tally: TALLY_VALUE,
        extensions: [{ name: 'tally', value: { groupOrder: 999 } }],
      },
    });
    expect(result.tally).toEqual(TALLY_VALUE);
  });
});

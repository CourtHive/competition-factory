import { setSchemaWriteMode } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';
import {
  buildSideExitProvenance,
  isPropagatedExit,
  getSideExitProvenance,
  producedExitStatus,
  setSideExitProvenance,
  exitOutcomeCode,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants
import { BYE, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_DEFAULT, OUTCOME_RETIREMENT, OUTCOME_WALKOVER } from '@Helpers/keyValueScore/constants';
import { LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';

afterEach(() => setSchemaWriteMode(NATIVE));

it('stamps per-side provenance on a matchUp fed by a double exit, attributed to its source', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 4,
        outcomes: [
          { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
          { roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-3', winningSide: 1 },
        ],
      },
    ],
    setState: true,
  });
  expect(tournamentRecord.tournamentId).not.toBeUndefined();
  expect(drawId).not.toBeUndefined();

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const source = matchUps.find(({ roundNumber, roundPosition }) => roundNumber === 1 && roundPosition === 1);
  const target = matchUps.find(({ roundNumber }) => roundNumber === 2);

  const provenance: any = target.sideExitProvenance;
  expect(provenance).not.toBeUndefined();

  // keyed by sideNumber, so no positional padding and no index arithmetic
  expect(Object.keys(provenance).sort((a, b) => Number(a) - Number(b))).toEqual(['1', '2']);

  const doubleExitSide: any = Object.values(provenance).find(
    (entry: any) => entry.previousMatchUpStatus === DOUBLE_WALKOVER,
  );
  expect(doubleExitSide.matchUpStatus).toEqual(WALKOVER);

  // the identity the unwind lacks in matchUpStatusCodes
  expect(doubleExitSide.sourceMatchUpId).toEqual(source.matchUpId);

  // P37. `expect(Array.isArray(target.matchUpStatusCodes)).toEqual(true)` stood here, pinning that
  // the legacy array is still written beside the native field. That is the property being RETIRED —
  // CA, 2026-09-27: *"we don't need to carry forward legacy equivalence at this point"* — so this
  // test asserts the first-class record and says nothing about the array.
});

/**
 * THE LEGACY DERIVATION IS GONE, AND THIS TEST NOW ASSERTS THAT.
 *
 * It read `reads provenance from the legacy array when the native field is absent` and pinned the
 * fallback: provenance-shaped elements of `matchUpStatusCodes` derived a `SideExitProvenance`.
 *
 * P37 removed it, on CA's ruling of 2026-09-27: *"we don't need to carry forward legacy equivalence at
 * this point, and not supporting LEGACY for bugs we are closing with provenance should not be considered
 * a breaking change. Any client that wants the resolutions should be moving to full NATIVE support."*
 *
 * Inverted rather than deleted, because the direction is the claim worth keeping: a record carrying ONLY
 * the legacy shape now reads as having no provenance, so nothing in the engine can derive behaviour from
 * that array. Deleting the test would leave the removal unpinned and a fallback could grow back.
 */
it('does NOT derive provenance from the legacy array — the fallback is removed', () => {
  const legacyOnly: any = {
    matchUpId: 'm1',
    matchUpStatusCodes: [
      { matchUpStatus: WALKOVER, previousMatchUpStatus: DOUBLE_WALKOVER, sideNumber: 1 },
      { matchUpStatus: DEFAULTED, previousMatchUpStatus: DOUBLE_DEFAULT, sideNumber: 2 },
    ],
  };

  expect(getSideExitProvenance({ matchUp: legacyOnly })).toBeUndefined();
  // and the predicate built on it agrees: no provenance means the exit was PLAYED, not produced
  expect(isPropagatedExit({ matchUp: legacyOnly })).toEqual(false);
});

it('ignores the policy and wrapped element shapes, which are not provenance', () => {
  const notProvenance: any = {
    matchUpId: 'm2',
    matchUpStatusCodes: [{ matchUpStatusCode: 'OA', label: 'Abandoned match' }, { code: 'WO' }, 'WO', ''],
  };
  expect(getSideExitProvenance({ matchUp: notProvenance })).toBeUndefined();
  expect(isPropagatedExit({ matchUp: notProvenance })).toEqual(false);
});

it('reads the native field, and the legacy array beside it changes nothing', () => {
  const both: any = {
    matchUpId: 'm3',
    sideExitProvenance: { 1: { previousMatchUpStatus: DOUBLE_DEFAULT, sourceMatchUpId: 'native-source' } },
    matchUpStatusCodes: [{ matchUpStatus: WALKOVER, previousMatchUpStatus: DOUBLE_WALKOVER, sideNumber: 1 }],
  };
  const provenance: any = getSideExitProvenance({ matchUp: both });
  expect(provenance[1].sourceMatchUpId).toEqual('native-source');
  expect(provenance[1].previousMatchUpStatus).toEqual(DOUBLE_DEFAULT);
});

it('does not write the native field in LEGACY mode', () => {
  const matchUp: any = { matchUpId: 'm4' };
  const provenance = buildSideExitProvenance({
    sourceMatchUpStatus: DOUBLE_WALKOVER,
    pairedMatchUpStatus: DOUBLE_DEFAULT,
    sourceMatchUpId: 'src',
    sourceSideNumber: 1,
  });

  setSchemaWriteMode(LEGACY);
  setSideExitProvenance({ matchUp, provenance });
  expect(matchUp.sideExitProvenance).toBeUndefined();

  setSchemaWriteMode(NATIVE);
  setSideExitProvenance({ matchUp, provenance });
  expect(matchUp.sideExitProvenance).not.toBeUndefined();
});

it('refuses to guess a side, and maps produced statuses', () => {
  // an unattributed entry is worse than no entry: the unwind would trust it
  expect(buildSideExitProvenance({ sourceMatchUpStatus: DOUBLE_WALKOVER })).toBeUndefined();
  expect(buildSideExitProvenance({ sourceMatchUpStatus: DOUBLE_WALKOVER, sourceSideNumber: 3 as any })).toBeUndefined();

  expect(producedExitStatus(DOUBLE_WALKOVER)).toEqual(WALKOVER);
  expect(producedExitStatus(DOUBLE_DEFAULT)).toEqual(DEFAULTED);
  // a BYE is not a double exit and must NOT be relabelled as a walkover
  expect(producedExitStatus('BYE')).toEqual('BYE');
});

/**
 * Regression for the coercion at progressExitStatus, which mapped EVERY object element to
 * OUTCOME_WALKOVER. Measured: of 50 provenance elements reaching it, 13 were BYE and 9 DEFAULTED.
 *
 * These assertions are deliberately at the element level. The only oracle that exercised the
 * surrounding path is a DOUBLE_WALKOVER/DOUBLE_DEFAULT parity test that rewrites "DEFAULTED" to
 * "WALKOVER" and "DEF" to "WO" before comparing, so it cannot distinguish a correct mapping from the
 * bug. Nothing that normalises the two statuses together can serve as a regression test here.
 */
it('maps an exit element to its OWN outcome code, and never invents a walkover', () => {
  expect(exitOutcomeCode({ matchUpStatus: WALKOVER, previousMatchUpStatus: DOUBLE_WALKOVER })).toEqual(
    OUTCOME_WALKOVER,
  );

  // the 9 measured DEFAULTED elements: previously relabelled 'WO'
  expect(exitOutcomeCode({ matchUpStatus: DEFAULTED, previousMatchUpStatus: DOUBLE_DEFAULT })).toEqual(OUTCOME_DEFAULT);
  expect(exitOutcomeCode({ previousMatchUpStatus: DOUBLE_DEFAULT })).toEqual(OUTCOME_DEFAULT);

  // the 13 measured BYE elements: a BYE is not an outcome and must contribute NO code
  expect(exitOutcomeCode({ previousMatchUpStatus: BYE })).toEqual('');
  expect(exitOutcomeCode({ matchUpStatus: BYE })).toEqual('');

  expect(exitOutcomeCode({ previousMatchUpStatus: RETIRED })).toEqual(OUTCOME_RETIREMENT);

  // strings pass through; the other two element shapes carry their own value
  expect(exitOutcomeCode('WO')).toEqual('WO');
  expect(exitOutcomeCode({ code: 'DEF' })).toEqual('DEF');
  expect(exitOutcomeCode({ matchUpStatusCode: 'OA' })).toEqual('OA');

  // an object with nothing to say contributes nothing, rather than a walkover
  expect(exitOutcomeCode({ sideNumber: 1 })).toEqual('');
  expect(exitOutcomeCode(undefined)).toEqual('');
});

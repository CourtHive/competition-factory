import { ADAPTIVE, LUCKY_DRAW, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { getOutcomePipeline, setOutcomePipeline } from '@Global/state/globalState';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { predictSettlement } from '@Mutate/matchUps/outcome/settlement';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

const entryMode = getOutcomePipeline();
afterEach(() => setOutcomePipeline(entryMode));

it.each([LUCKY_DRAW, ADAPTIVE, SINGLE_ELIMINATION] as const)(
  'uses the draw’s winner-advancement rule when replacing a played result by a double exit in %s',
  (drawType) => {
    for (const matchUpStatus of [DOUBLE_DEFAULT, DOUBLE_WALKOVER] as const) {
      setOutcomePipeline('v1');
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawType, drawSize: 8 }],
        nonRandom: 3,
      });
      const event = tournamentRecord.events[0];
      const drawDefinition = event.drawDefinitions[0];
      const args = { drawDefinition, event, tournamentRecord };
      const structure = drawDefinition.structures[0];
      const root = structure.matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1)!;
      const receiver = structure.matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1)!;
      const played = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-2 6-1', winningSide: 1 }).outcome;
      const flags = { allowChangePropagation: true, propagateExitStatus: true, propagateRetirementAsExit: false };
      expect(setMatchUpStatus({ ...args, ...flags, matchUpId: root.matchUpId, outcome: played })).toMatchObject({
        success: true,
      });
      const previousPosition = root.drawPositions![0];
      expect(receiver.drawPositions).toContain(previousPosition);
      const projected = predictSettlement({
        ...args,
        request: { matchUpId: root.matchUpId, matchUpStatus, flags },
      });
      const next = getMatchUpsMap({ drawDefinition: projected.drawDefinition }).drawMatchUps.find(
        (m) => m.matchUpId === receiver.matchUpId,
      )!;
      expect(
        setMatchUpStatus({ ...args, ...flags, matchUpId: root.matchUpId, outcome: { matchUpStatus } }),
      ).toMatchObject({
        success: true,
      });
      expect(receiver.drawPositions ?? []).not.toContain(previousPosition);
      expect(next.drawPositions ?? []).not.toContain(previousPosition);
      expect(next.matchUpStatus).toBe(receiver.matchUpStatus);
      expect(next.sideExitProvenance).toStrictEqual(receiver.sideExitProvenance);
      if (drawType === SINGLE_ELIMINATION) {
        expect(Object.values(receiver.sideExitProvenance ?? {})).toContainEqual(
          expect.objectContaining({ sourceMatchUpId: root.matchUpId, previousMatchUpStatus: matchUpStatus }),
        );
      } else {
        expect(receiver.matchUpStatus).toBe(TO_BE_PLAYED);
        expect(receiver.sideExitProvenance).toBeUndefined();
      }
    }
  },
);

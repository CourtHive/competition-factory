import { assignDrawPositionBye as placeDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { captureNotices } from '../../notifications/noticeConformance/harness';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import { afterAll, describe, expect, it, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';

// constants
import { SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  COMPASS,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FEED_IN,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  LUCKY_DRAW,
  MFIC,
  OLYMPIC,
  PLAYOFF,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

/**
 * F-016 positive control. Each accepted or refused public BYE placement is made twice from the same record: through
 * the writer it replaces (imported as `legacyAssignDrawPositionBye`, and its `assignDrawPosition` spelling) and through
 * the planned public method. Both must return the same material result, store the same record key for key, stamps
 * included, and send the same ordered notices with the same payloads.
 *
 * Walks the planner leaves to the writer (an exit on the path) are counted, so the planned share is visible.
 */
useEngineCatch();

const counts = { planned: 0, unplanned: 0, refused: 0, steps: 0 };
const reasons: Record<string, number> = {};
vi.mock('@Mutate/matchUps/drawPositions/planDrawPositionBye', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/drawPositions/planDrawPositionBye')>();
  return {
    ...actual,
    planDrawPositionBye: (...args: Parameters<typeof actual.planDrawPositionBye>) => {
      const planned = actual.planDrawPositionBye(...args);
      if (planned.unplanned !== undefined) {
        counts.unplanned += 1;
        reasons[planned.unplanned] = (reasons[planned.unplanned] ?? 0) + 1;
      } else if (planned.result.error) counts.refused += 1;
      else counts.planned += 1;
      return planned;
    },
  };
});
afterAll(() => {
  setClock();
  if (process.env.F016_COUNTS) process.stdout.write(`F016_COUNTS ${JSON.stringify({ counts, reasons })}\n`);
});

function legacyAssignDrawPosition({ tournamentRecord, drawDefinition, drawPosition, structureId, event }: any) {
  const result = placeDrawPositionBye({ tournamentRecord, drawDefinition, drawPosition, structureId, event });
  return result.error ? result : { ...SUCCESS };
}

tournamentEngine.importMethods({ legacyAssignDrawPositionBye: placeDrawPositionBye, legacyAssignDrawPosition });

const instant = '2030-01-01T00:00:00.000Z';
const material = (result: any) => {
  if (!result || typeof result !== 'object') return result;
  const { stack, ...rest } = result;
  if (stack !== undefined) expect(Array.isArray(stack)).toBe(true);
  return structuredClone(rest);
};

function run(state: any, method: string, params: any) {
  setClock(instant);
  tournamentEngine.setState(structuredClone(state));
  let result: any;
  const notices = captureNotices(() => {
    try {
      result = tournamentEngine[method](structuredClone(params));
    } catch (error: any) {
      result = { thrown: error?.message };
    }
  });
  return {
    result: material(result),
    notices: JSON.stringify(notices),
    record: tournamentEngine.getTournament().tournamentRecord,
  };
}

/** both arms from `state`; the candidate's record is returned to carry the sequence on */
function compare(state: any, params: any, viaAssignDrawPosition: boolean) {
  const [legacyMethod, method] = viaAssignDrawPosition
    ? ['legacyAssignDrawPosition', 'assignDrawPosition']
    : ['legacyAssignDrawPositionBye', 'assignDrawPositionBye'];
  const extra = viaAssignDrawPosition ? { bye: true } : {};
  const base = run(state, legacyMethod, { ...params, ...extra });
  // the mutation notice names the directive: the imported writer's name stands for the public one
  base.notices = base.notices.replaceAll(`"${legacyMethod}"`, `"${method}"`);
  const candidate = run(state, method, { ...params, ...extra });
  expect(candidate.result).toEqual(base.result);
  expect(JSON.stringify(candidate.record)).toBe(JSON.stringify(base.record));
  if (candidate.notices !== base.notices) {
    const [b, c] = [base.notices, candidate.notices].map((n) => JSON.parse(n));
    const at = b.findIndex((notice: any, index: number) => JSON.stringify(notice) !== JSON.stringify(c[index]));
    expect({ params, at, topics: c.map((n: any) => n.topic), candidate: c[at] }).toEqual({
      params,
      at,
      topics: b.map((n: any) => n.topic),
      candidate: b[at],
    });
  }
  counts.steps += 1;
  return candidate.record;
}

const drawTypes = [
  SINGLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  MFIC,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
  DOUBLE_ELIMINATION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  LUCKY_DRAW,
  FEED_IN,
  PLAYOFF,
];

type Variant = 'empty' | 'scored' | 'exits' | 'scheduled';
const variants: Variant[] = ['empty', 'scored', 'exits', 'scheduled'];

function scenario(drawType: string, drawSize: number, eventType: string, variant: Variant) {
  let generated: any;
  try {
    generated = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType, drawSize, eventType, automated: false }],
      nonRandom: 1,
      setState: false,
    });
  } catch {
    return undefined;
  }
  const { tournamentRecord, drawIds } = generated ?? {};
  if (!tournamentRecord || !drawIds?.length) return undefined;
  const [drawId] = drawIds;
  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  if (!drawDefinition) return undefined;
  const [main] = drawDefinition.structures;
  const structureId = main.structureId;
  const participantIds = tournamentRecord.participants
    .filter((p: any) => (eventType === TEAM_EVENT ? p.participantType === 'TEAM' : p.participantType === 'INDIVIDUAL'))
    .map((p: any) => p.participantId);
  const positions = (main.positionAssignments ?? main.structures?.flatMap((s: any) => s.positionAssignments) ?? []).map(
    (a: any) => a.drawPosition,
  );
  if (variant !== 'empty') {
    // participants on every position ≡ 3 or 0 (mod 4): first-round matchUps (3, 4), (7, 8), ... are contested
    let index = 0;
    for (const drawPosition of positions) {
      if (drawPosition % 4 !== 3 && drawPosition % 4 !== 0) continue;
      const participantId = participantIds[index++];
      if (!participantId) break;
      tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition, participantId });
    }
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const contested = matchUps.filter(
      (m: any) =>
        m.structureId === structureId &&
        m.roundNumber === 1 &&
        !m.collectionId &&
        m.sides?.every((side: any) => side.participantId),
    );
    contested.forEach((matchUp: any, at: number) => {
      if (variant === 'scheduled') {
        tournamentEngine.addMatchUpScheduleItems({
          matchUpId: matchUp.matchUpId,
          schedule: { scheduledDate: '2030-01-02' },
          drawId,
        });
        return;
      }
      if (matchUp.matchUpType === 'TEAM') return;
      const exit = at % 2 ? { matchUpStatus: 'DOUBLE_WALKOVER' } : { matchUpStatus: 'WALKOVER', winningSide: 2 };
      const outcome =
        variant === 'exits'
          ? exit
          : mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
      tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, outcome, drawId });
    });
  }
  // the matchUps for a scheduled first-round matchUp also cover a placement asked as a position action
  const structures = drawDefinition.structures.map((s: any) => s.structureId);
  return { state: tournamentEngine.getTournament().tournamentRecord, drawId, structureId, positions, structures };
}

describe('the planned BYE placement matches the writer it replaces', () => {
  for (const drawType of drawTypes) {
    for (const drawSize of [8, 16, 32]) {
      for (const eventType of [SINGLES_EVENT, TEAM_EVENT]) {
        if (eventType === TEAM_EVENT && drawSize > 16) continue;
        it(`${drawType} ${drawSize} ${eventType}`, () => {
          for (const variant of variants) {
            const built = scenario(drawType, drawSize, eventType, variant);
            if (!built) continue;
            let state = built.state;
            const { drawId, structureId, positions } = built;
            // BYEs on the main positions in two orders, then on a linked structure's first positions
            const order = variant === 'scored' ? [...positions].reverse() : positions;
            order.forEach((drawPosition: number, at: number) => {
              const params: any = { drawId, structureId, drawPosition };
              if (variant === 'scheduled') {
                params.isPositionAction = true;
                if (at % 3) params.preserveScheduling = at % 3 === 1;
              }
              state = compare(state, params, at % 4 === 3 && !params.isPositionAction);
            });
            for (const linked of built.structures.slice(1, 3))
              for (const drawPosition of [1, 2, 3])
                state = compare(state, { drawId, structureId: linked, drawPosition }, false);
          }
        });
      }
    }
  }
});

it('matches the writer where the caller declares the positions inactive over a won matchUp', () => {
  const built = scenario(SINGLE_ELIMINATION, 8, SINGLES_EVENT, 'scored');
  if (!built) return;
  // positions 3 and 4 were played: position 3 won, and is placed a BYE where it stands
  compare(
    built.state,
    { drawId: built.drawId, structureId: built.structureId, drawPosition: 3, drawPositionsInactive: true },
    false,
  );
});

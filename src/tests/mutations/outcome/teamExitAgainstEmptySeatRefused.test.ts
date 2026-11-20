import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setOutcomePipeline } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, describe, expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { INVALID_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * A TEAM DUAL'S EXIT AGAINST AN EMPTY SEAT IS REFUSED AS A SINGLES MATCHUP'S IS (prototype of option D, pending CA's
 * ruling). § 2 row 6, its participants clause (§ 2.1).
 *
 * FIRST_MATCH_LOSER_CONSOLATION 8, DOMINANT_DUO. `Main|1|1`'s loser reaches `Consolation|1|1` dp 3; dp 4 is claimed and
 * empty until `Main|1|2` is decided. A single exit entered there before then is waived only when it awards the exit to
 * an awardable side (§ 2.1, `exitAwardable`): never the participant already present. A singles matchUp refuses
 * `DEFAULTED` to the present side with `ERR_INVALID_MATCHUP_STATUS`. A TEAM dual accepted it: it stores its own sides,
 * so the participants clause read no assignments and passed vacuously. (The awaited dp 4 itself stays awardable on a
 * dual, as C22 pins, where singles refuses it as a phantom.)
 * Accepted, the default went on through `Consolation|2|1`'s BYE, the main loser then arrived on the defaulted side, took
 * the default, and was advanced into the full `Consolation|2|1` under a swallowed `ERR_EXISTING_POSITION_ASSIGNMENT`.
 *
 * CONTROL: an exit with no winner yet (the WALKOVER `Main|1|1`'s double walkover produces in `Main|2|1`) still goes to
 * whoever arrives, and an exit entered against an UNFILLED feed slot is still waived.
 */

const MODES = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const;
const DRAW_ID = 'd';

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

const topMatchUps = () =>
  (tournamentEngine.allDrawMatchUps({ drawId: DRAW_ID, inContext: true }).matchUps as any[]).filter(
    (matchUp) => !matchUp.matchUpTieId,
  );
const at = (key: string) => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return topMatchUps().find(
    (matchUp) =>
      matchUp.structureName === structureName &&
      matchUp.roundNumber === Number(roundNumber) &&
      matchUp.roundPosition === Number(roundPosition),
  );
};
const set = (key: string, outcome: any) =>
  tournamentEngine.setMatchUpStatus({ drawId: DRAW_ID, matchUpId: at(key).matchUpId, outcome });
const participants = (key: string) => at(key).sides.map((side: any) => side.participantId ?? null);
const record = () => JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
const inconsistencies = () =>
  getDrawInconsistencies({ drawDefinition: tournamentEngine.getEvent({ drawId: DRAW_ID }).drawDefinition })
    .inconsistencies ?? [];

function setup(team: boolean) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  const drawProfile: any = { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, drawId: DRAW_ID };
  if (team) Object.assign(drawProfile, { tieFormatName: DOMINANT_DUO, eventType: TEAM_EVENT });
  mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], nonRandom: 1, setState: true });
}

const ARMS = MODES.flatMap((mode) => [true, false].map((team) => [mode, team] as const));

describe('an exit against a claimed empty seat is refused, TEAM dual or singles', () => {
  it.each(MODES)('%s: TEAM, DEFAULTED to the present team is refused and the record is unchanged', (mode) => {
    setup(true);
    expect(set('Main|1|1', { winningSide: 1 }).success).toEqual(true);
    const [present] = participants('Consolation|1|1');
    expect(present).toBeTruthy();

    setOutcomePipeline(mode);
    const before = record();
    const result = set('Consolation|1|1', { matchUpStatus: DEFAULTED, winningSide: 1 });
    expect(result.error?.code).toEqual(INVALID_MATCHUP_STATUS.code);
    expect(record()).toEqual(before);

    // the main loser then arrives on a matchUp to be played, and nothing has gone on from it
    const next = set('Main|1|2', { winningSide: 1 });
    expect(next.success, JSON.stringify(next.error)).toEqual(true);
    const loser = at('Main|1|2').sides[1].participantId;
    const consolation = at('Consolation|1|1');
    expect([consolation.matchUpStatus, consolation.winningSide]).toEqual([TO_BE_PLAYED, undefined]);
    expect(participants('Consolation|1|1')).toEqual([present, loser]);
    expect(participants('Consolation|3|1').filter(Boolean)).toEqual([]);
    expect(inconsistencies()).toEqual([]);
  });

  it.each(ARMS)(
    '%s: team %s, an exit or a winner awarded to the present side is refused as singles refuses it',
    (mode, team) => {
      setup(team);
      expect(set('Main|1|1', { winningSide: 1 }).success).toEqual(true);
      setOutcomePipeline(mode);
      const before = record();
      for (const outcome of [
        { matchUpStatus: DEFAULTED, winningSide: 1 },
        { matchUpStatus: WALKOVER, winningSide: 1 },
        { winningSide: 1 },
      ]) {
        const result = set('Consolation|1|1', outcome);
        expect(result.error?.code, JSON.stringify(outcome)).toEqual(INVALID_MATCHUP_STATUS.code);
      }
      expect(record()).toEqual(before);
    },
  );
});

describe('CONTROL: the waiver and the produced exit are unchanged', () => {
  // the awaited seat: dp 4 is claimed by the main loser still to come. A singles matchUp refuses it as a phantom; a TEAM
  // dual keeps accepting it (C22, `ownedDirectionWrites.unreached`)
  it.each(ARMS)('%s: team %s, an exit awarded to the awaited seat is kept as it was', (mode, team) => {
    setup(team);
    expect(set('Main|1|1', { winningSide: 1 }).success).toEqual(true);
    setOutcomePipeline(mode);
    const result = set('Consolation|1|1', { matchUpStatus: DEFAULTED, winningSide: 2 });
    if (team) {
      expect(result.success, JSON.stringify(result.error)).toEqual(true);
      expect([at('Consolation|1|1').matchUpStatus, at('Consolation|1|1').winningSide]).toEqual([DEFAULTED, 2]);
    } else expect(result.error?.code).toEqual(INVALID_MATCHUP_STATUS.code);
  });

  it.each(ARMS)('%s: team %s, an exit against an unfilled feed slot is still waived', (mode, team) => {
    setup(team);
    expect(set('Main|1|1', { winningSide: 1 }).success).toEqual(true);
    setOutcomePipeline(mode);
    // `Main|2|1` holds dp 1; its other seat is fed by `Main|1|2`, still to be played
    const result = set('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 });
    expect(result.success, JSON.stringify(result.error)).toEqual(true);
    expect([at('Main|2|1').matchUpStatus, at('Main|2|1').winningSide]).toEqual([WALKOVER, 2]);
  });

  it.each(ARMS)('%s: team %s, the produced walkover goes to whoever arrives', (mode, team) => {
    setup(team);
    expect(set('Main|1|1', { matchUpStatus: DOUBLE_WALKOVER }).success).toEqual(true);
    const produced = at('Main|2|1');
    expect([produced.matchUpStatus, produced.winningSide]).toEqual([WALKOVER, undefined]);

    setOutcomePipeline(mode);
    const result = set('Main|1|2', { winningSide: 1 });
    expect(result.success, JSON.stringify(result.error)).toEqual(true);
    const winner = at('Main|1|2').sides[0].participantId;
    expect([at('Main|2|1').matchUpStatus, at('Main|2|1').winningSide]).toEqual([WALKOVER, 2]);
    expect(participants('Main|3|1')).toContain(winner);
    expect(inconsistencies()).toEqual([]);
  });
});

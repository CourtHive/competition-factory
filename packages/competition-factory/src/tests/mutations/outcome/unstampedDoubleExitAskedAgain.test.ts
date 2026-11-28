import { expectPlayedParity, playCall, prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { resolveTieFormat, tieFormatConstants } from '@courthive/competition-catalogue';
import { setSubscriptions } from '@Global/state/globalState';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

// constants
import { AD_HOC, FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Tests/testHarness/outcomeModes';

const { DOMINANT_DUO } = tieFormatConstants;

/**
 * A DOUBLE EXIT STORED WITH NO `scoredTime`, ASKED AGAIN, IS STAMPED. A double exit asked for again is satisfied: v1
 * writes, stamps and announces nothing of it. But a scored matchUp holding no `scoredTime` (a record older than the
 * stamp, or one a failed write left) is given one where the call ends (`applyScoredTime`), and that is then the call's
 * one write. v2 planned no write at all, in every draw but a lucky one (`luckyDoubleExit.test.ts`).
 */
afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

const DRAW_ID = 'd';
const TEAM_DRAW = { eventType: TEAM, tieFormat: resolveTieFormat(DOMINANT_DUO) };

function storedMatchUp(record: any, matchUpId: string): any {
  let found: any;
  const visit = (value: any) => {
    if (!value || typeof value !== 'object' || found) return;
    if (value.matchUpId === matchUpId) found = value;
    else Object.values(value).forEach(visit);
  };
  visit(record.events);
  return found;
}

it.each([
  ['an elimination draw', { drawSize: 8 }, DOUBLE_WALKOVER, false],
  ['an elimination draw', { drawSize: 8 }, DOUBLE_DEFAULT, false],
  ['a round robin', { drawSize: 4, drawType: ROUND_ROBIN }, DOUBLE_WALKOVER, false],
  ['a consolation draw', { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }, DOUBLE_DEFAULT, false],
  ['an ad hoc draw', { drawSize: 8, drawType: AD_HOC, automated: true, roundsCount: 1 }, DOUBLE_WALKOVER, false],
  ['a TEAM dual', { drawSize: 4, ...TEAM_DRAW }, DOUBLE_WALKOVER, false],
  ['a TEAM line', { drawSize: 4, ...TEAM_DRAW }, DOUBLE_DEFAULT, true],
])('%s: a %s holding no scoredTime, asked again, is stamped under every pipeline', (_label, profile, status, line) => {
  const call = prepareCall(() => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ ...profile, drawId: DRAW_ID }],
      setState: true,
      nonRandom: 1,
    });
    if ('eventType' in profile)
      tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: DRAW_ID });
    const first = tournamentEngine
      .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
      .matchUps.find((matchUp: any) => !matchUp.collectionId && matchUp.matchUpStatus === TO_BE_PLAYED);
    const { matchUpId } = line ? first.tieMatchUps[0] : first;
    const params = { drawId: DRAW_ID, matchUpId, outcome: { matchUpStatus: status } };
    expect(tournamentEngine.setMatchUpStatus(params).success).toEqual(true);
    // the record as an older one holds it: the double exit, and no stamp
    const { tournamentRecord } = tournamentEngine.getTournament();
    const held = storedMatchUp(tournamentRecord, matchUpId);
    expect(held.schedule?.scoredTime).toBeDefined();
    delete held.schedule;
    expect(tournamentEngine.setState(tournamentRecord).success).toEqual(true);
    return params;
  });
  const matchUpId = call.params.matchUpId as string;
  expect(storedMatchUp(call.prepared, matchUpId).schedule).toBeUndefined();

  const v1 = playCall(OUTCOME_PIPELINE_V1, call);
  expect(v1.result).toEqual({ success: true });
  const written = storedMatchUp(JSON.parse(v1.record), matchUpId);
  expect(written.matchUpStatus).toEqual(status);
  expect(written.schedule?.scoredTime).toBeDefined();
  for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
    const actual = playCall(mode, call);
    expectPlayedParity(actual, v1);
  }
});

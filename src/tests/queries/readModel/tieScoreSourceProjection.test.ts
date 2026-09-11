import { mocksEngine } from '@Assemblies/engines/mock';
import { cast } from '@Query/readModel/cast';
import { expect, it, describe } from 'vitest';

// constants and types
import { TieScoreSourceEnum } from '@Types/tournamentTypes';
import { SINGLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

const TIE_FORMAT: any = {
  tieFormatName: 'PROJECTION_SINGLES_3',
  winCriteria: { valueGoal: 2 },
  collectionDefinitions: [
    {
      collectionName: 'Singles',
      matchUpFormat: 'SET3-S:6/TB7',
      collectionId: 'singles',
      matchUpType: SINGLES,
      collectionOrder: 1,
      matchUpValue: 1,
      matchUpCount: 3,
    },
  ],
};

function castRows(scoreSource?: any) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormat: { ...TIE_FORMAT, scoreSource }, drawId: 'drawId' }],
  });

  const rows: any = cast({ tournamentRecord }).rows;
  const matchUpRows = rows.match_ups;

  return {
    tieRows: matchUpRows.filter(({ match_up_level }) => match_up_level === 'TIE'),
    rubberRows: matchUpRows.filter(({ match_up_level }) => match_up_level === 'RUBBER'),
  };
}

describe('read model projection of tieFormat scoreSource', () => {
  it('projects REPORTED onto TIE rows so a consumer can tell "no line detail" from "not yet entered"', () => {
    const { tieRows } = castRows(TieScoreSourceEnum.REPORTED);

    expect(tieRows.length).toBeGreaterThan(0);
    expect(tieRows.every(({ score_source }) => score_source === TieScoreSourceEnum.REPORTED)).toEqual(true);
  });

  // falsification: the same projection over a DERIVED tieFormat must NOT report a score source
  it('leaves score_source null when the tieFormat does not declare one', () => {
    const { tieRows } = castRows(undefined);

    expect(tieRows.length).toBeGreaterThan(0);
    expect(tieRows.every(({ score_source }) => score_source === null)).toEqual(true);
  });

  it('emits no rubber rows for a REPORTED tie and rubber rows for a derived one', () => {
    // REPORTED lines are unpopulated by design, so nothing is materialized to project
    expect(castRows(TieScoreSourceEnum.REPORTED).rubberRows.length).toEqual(0);
    expect(castRows(undefined).rubberRows.length).toBeGreaterThan(0);
  });

  it('never sets score_source on a non-TEAM matchUp row', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawId: 'singlesDrawId' }],
    });

    const rows: any = cast({ tournamentRecord }).rows;
    expect(rows.match_ups.length).toBeGreaterThan(0);
    expect(rows.match_ups.every(({ score_source }) => score_source === null)).toEqual(true);
  });
});

import { resolveMatchUpPublishState } from '@Query/readModel/readModelPublish';
import { expect, it, describe } from 'vitest';

const FUTURE = '2999-01-01T00:00:00.000Z';

describe('resolveMatchUpPublishState', () => {
  it('is unpublished with no status', () => {
    expect(resolveMatchUpPublishState(undefined, 'd1')).toEqual({ published: false, embargo: null });
  });

  it('honors a legacy event-level published flag when drawDetails is absent', () => {
    expect(resolveMatchUpPublishState({ published: true }, 'd1')).toEqual({ published: true, embargo: null });
    expect(resolveMatchUpPublishState({ published: false }, 'd1')).toEqual({ published: false, embargo: null });
  });

  it('treats empty drawDetails as all-published', () => {
    expect(resolveMatchUpPublishState({ drawDetails: {} }, 'd1')).toEqual({ published: true, embargo: null });
  });

  it('is unpublished when the draw is enumerated but absent', () => {
    const status = { drawDetails: { other: { publishingDetail: { published: true } } } };
    expect(resolveMatchUpPublishState(status, 'd1')).toEqual({ published: false, embargo: null });
  });

  it('publishes a listed draw and carries a draw-level embargo (intent stays true under embargo)', () => {
    const status = { drawDetails: { d1: { publishingDetail: { published: true, embargo: FUTURE } } } };
    expect(resolveMatchUpPublishState(status, 'd1', 's1', 'MAIN')).toEqual({ published: true, embargo: FUTURE });
  });

  it('applies the structure gate: enumerated structures publish only the listed ones', () => {
    const status = {
      drawDetails: {
        d1: {
          publishingDetail: { published: true },
          structureDetails: { sMain: { published: true } },
        },
      },
    };
    expect(resolveMatchUpPublishState(status, 'd1', 'sMain', 'MAIN').published).toBe(true);
    expect(resolveMatchUpPublishState(status, 'd1', 'sQual', 'QUALIFYING').published).toBe(false);
  });

  it('applies the stage gate and explicit published:false', () => {
    const status = {
      drawDetails: {
        d1: {
          publishingDetail: { published: true },
          stageDetails: { MAIN: { published: true }, QUALIFYING: { published: false } },
        },
      },
    };
    expect(resolveMatchUpPublishState(status, 'd1', 's', 'MAIN').published).toBe(true);
    expect(resolveMatchUpPublishState(status, 'd1', 's', 'QUALIFYING').published).toBe(false);
  });

  it('resolves embargo with draw > stage > structure precedence', () => {
    const structureOnly = {
      drawDetails: { d1: { publishingDetail: { published: true }, structureDetails: { s1: { embargo: 'STRUCT' } } } },
    };
    expect(resolveMatchUpPublishState(structureOnly, 'd1', 's1', 'MAIN').embargo).toEqual('STRUCT');

    const stageOverStructure = {
      drawDetails: {
        d1: {
          publishingDetail: { published: true },
          stageDetails: { MAIN: { embargo: 'STAGE' } },
          structureDetails: { s1: { embargo: 'STRUCT' } },
        },
      },
    };
    expect(resolveMatchUpPublishState(stageOverStructure, 'd1', 's1', 'MAIN').embargo).toEqual('STAGE');

    const drawOverAll = {
      drawDetails: {
        d1: {
          publishingDetail: { published: true, embargo: 'DRAW' },
          stageDetails: { MAIN: { embargo: 'STAGE' } },
          structureDetails: { s1: { embargo: 'STRUCT' } },
        },
      },
    };
    expect(resolveMatchUpPublishState(drawOverAll, 'd1', 's1', 'MAIN').embargo).toEqual('DRAW');
  });
});

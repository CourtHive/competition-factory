import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '@Server/app.module';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { TEST_EMAIL, TEST_PASSWORD } from '@Server/common/constants/test';

/**
 * The async wrapper contract (src/tests/engines/asyncWrapperContract.test.ts) from the outside, over HTTP, against
 * this reference server (competition-factory-server is the real implementation): a queue refused part-way persists
 * nothing.
 *
 * NOT here, deliberately: overlapping requests on different tournaments. Written and measured 2026-10-17, it stayed
 * green with per-request state switched OFF (every request sharing one state), because between this server's
 * setState and getState a request awaits only microtasks, so a sibling's I/O callback never runs inside that window.
 * A test that cannot fail certifies nothing; per-context isolation under interleaving is items 1-4 of the unit
 * contract, which interleave on real timers. Notices are not observable over this server's HTTP API either (it
 * subscribes to nothing); per-context delivery is unit item 3.
 */

const ONE = 'async-contract-one';

describe('async wrapper contract, over HTTP', () => {
  let app: INestApplication;
  let token: string;

  const post = (path: string, body: any) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ' + token)
      .send(body);

  const nameOf = async (tournamentId: string) => {
    const result = await post('/factory/query', {
      params: { tournamentId },
      method: 'getTournamentInfo',
      tournamentId,
    }).expect(200);
    return result.body.tournamentInfo?.tournamentName;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    token = login.body.token;

    await post('/factory/generate', { tournamentAttributes: { tournamentId: ONE } }).expect(200);
  });

  afterAll(async () => {
    await post('/factory/remove', { tournamentIds: [ONE] });
    await app.close();
  });

  it('a queue refused part-way persists nothing', async () => {
    const before = await nameOf(ONE);
    await post('/factory', {
      executionQueue: [
        { method: 'setTournamentName', params: { tournamentName: 'never-saved' } },
        { method: 'setTournamentDates', params: { startDate: 'not-a-date' } },
      ],
      tournamentId: ONE,
    }).expect(500);

    expect(before).toBeDefined();
    expect(await nameOf(ONE)).toEqual(before);
  });
});

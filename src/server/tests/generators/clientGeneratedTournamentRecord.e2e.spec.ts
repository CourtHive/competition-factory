import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mocksEngine } from '@Assemblies/engines/mock';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// Constants
import { TEST_EMAIL, TEST_PASSWORD } from '../../common/constants/test';
import { SINGLES } from '@Constants/eventConstants';

describe('AppService', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const loginReq = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);

    token = loginReq.body.token;
  });

  it('should have a token', async () => {
    expect(token).toBeDefined();
  });

  it('can remove, create, save and fetch a tournamentRecord', async () => {
    const tournamentId = 't1';

    let result = await request(app.getHttpServer())
      .post('/factory/remove')
      .set('Authorization', 'Bearer ' + token)
      .send({ tournamentId })
      .expect(200);
    expect(result.body.success).toEqual(true);

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId: 'e1', eventType: SINGLES }],
      tournamentAttributes: { tournamentId },
    });

    expect(tournamentRecord.events.length).toEqual(1);

    result = await request(app.getHttpServer())
      .post('/factory/save')
      .set('Authorization', 'Bearer ' + token)
      .send({ tournamentRecord })
      .expect(200);
    expect(result.body.success).toEqual(true);

    result = await request(app.getHttpServer())
      .post('/factory/fetch')
      .set('Authorization', 'Bearer ' + token)
      .send({ tournamentId })
      .expect(200);
    expect(result.body.success).toEqual(true);
    expect(result.body.fetched).toEqual(1);
  });

  afterAll(async () => {
    await app.close();
  });
});

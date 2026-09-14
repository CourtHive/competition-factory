import { UsersModule } from '@Server/providers/users/users.module';
import { FactoryController } from './factory.controller';
import { beforeAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthModule } from '@Server/auth/auth.module';
import { FactoryService } from './factory.service';

describe('AppService', () => {
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AuthModule, UsersModule],
      controllers: [FactoryController],
      providers: [FactoryService],
    }).compile();
  });

  describe('version', () => {
    it('should return version', () => {
      const factoryController = app.get(FactoryController);
      expect(factoryController.getVersion().version).toBeDefined();
    });
  });
});

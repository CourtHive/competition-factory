import { UsersModule } from '@Server/providers/users/users.module';
import { beforeEach, describe, expect, it } from 'vitest';
import { FactoryController } from './factory.controller';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthModule } from '@Server/auth/auth.module';
import { FactoryService } from './factory.service';

describe('AppController', () => {
  let factoryController: FactoryController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [AuthModule, UsersModule],
      controllers: [FactoryController],
      providers: [FactoryService],
    }).compile();

    factoryController = app.get<FactoryController>(FactoryController);
  });

  it('should be defined', () => {
    expect(factoryController).toBeDefined();
  });
});

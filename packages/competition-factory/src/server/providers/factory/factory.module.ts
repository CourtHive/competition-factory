import { FactoryService } from './factory.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [FactoryService],
  exports: [FactoryService],
})
export class FactoryModule {}

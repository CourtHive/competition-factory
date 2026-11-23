import { validateConfig } from './config-validation';
import { ConfigModule } from '@nestjs/config';
import { configurations } from './config';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [...configurations],
      validate: validateConfig,
      isGlobal: true,
    }),
  ],
})
export class ConfigsModule {}

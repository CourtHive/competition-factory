import { FactoryController } from './providers/factory/factory.controller';
import { FactoryService } from './providers/factory/factory.service';
import { UsersModule } from './providers/users/users.module';
import { ConfigsModule } from './config/config.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { AppService } from './app.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [ConfigsModule, AuthModule, UsersModule],
  controllers: [AppController, FactoryController],
  providers: [AppService, FactoryService],
})
export class AppModule {}

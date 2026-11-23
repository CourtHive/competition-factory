import { UsersService } from './users.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

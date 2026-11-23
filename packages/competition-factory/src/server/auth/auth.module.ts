import { UsersModule } from '@Server/providers/users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './guards/auth.guard';
import { AuthService } from './auth.service';
import { APP_GUARD } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

function isValidJwtExpiresIn(val: string): boolean {
  // Only allow numbers or numbers with single unit: s, m, h, d, w, M, y
  return /^(\d+|(\d+)([smhdwMy]))$/.test(val);
}

const rawValidity = process.env.JWT_VALIDITY;
const expiresIn: any = rawValidity && isValidJwtExpiresIn(rawValidity) ? rawValidity : '1d';

@Module({
  imports: [
    JwtModule.register({ signOptions: { expiresIn }, secret: process.env.JWT_SECRET, global: true }),
    UsersModule,
  ],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}

import { Environment, ConfigKey } from '@Server/common/constants/app';
import { registerAs } from '@nestjs/config';

export const APPConfig = registerAs(ConfigKey.App, () => ({
  env: Environment[process.env.NODE_ENV as keyof typeof Environment] || Environment.Development,
  port: Number(process.env.APP_PORT) || 8383,
  name: String(process.env.APP_NAME),
  appName: process.env.APP_NAME,
}));

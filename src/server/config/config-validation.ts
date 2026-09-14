import { IsDefined, IsString, IsNumber, validateSync, MinLength, IsEnum } from '@nestjs/class-validator';
import { Environment } from '@Server/common/constants/app';
import { plainToClass } from '@nestjs/class-transformer';

class EnvironmentVariables {
  @IsDefined()
  @IsNumber()
  APP_PORT?: number;

  @IsDefined()
  @IsString()
  @MinLength(1)
  APP_NAME?: string;

  @IsDefined()
  @IsString()
  @MinLength(1)
  JWT_SECRET?: string;

  @IsDefined()
  @IsString()
  @IsEnum(Environment)
  NODE_ENV?: string;
}

export function validateConfig(configuration: Record<string, unknown>) {
  const finalConfig = plainToClass(EnvironmentVariables, configuration, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(finalConfig, { skipMissingProperties: false });

  let index = 0;
  for (const err of errors) {
    for (const constraint of Object.values(err?.constraints ?? {})) {
      ++index;
      console.log(index, constraint);
    }
    console.log('\n ***** \n');
  }
  if (errors.length) throw new Error('missing valid ENV');

  return finalConfig;
}

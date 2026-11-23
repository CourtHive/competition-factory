import { InternalServerErrorException, Logger } from '@nestjs/common';

export function checkEngineError(result: any) {
  if (!result.success) {
    const { error } = result;
    if (!error) throw new InternalServerErrorException('Unknown engine error');
    const errorMessage = `${error.methodName || 'error'}: ${error.message}`;
    Logger.error(errorMessage);
    throw new InternalServerErrorException(errorMessage);
  }
}

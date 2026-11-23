import { Injectable } from '@nestjs/common';
@Injectable()
export class AppService {
  factoryService(): any {
    return { message: 'Factory server' };
  }
}

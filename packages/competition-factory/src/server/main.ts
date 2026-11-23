import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { json } from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    methods: ['GET', 'POST'],
    allowedHeaders: '*',
    origin: '*',
  });

  app.use(json({ limit: '8mb' }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Competition Factory Server API')
    .setDescription('API description')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    // deepScanRoutes: true,
  });
  SwaggerModule.setup('api', app, document);

  const config = app.get(ConfigService);
  const appName = config.get('APP.name');
  const port = config.get('APP.port');

  await app.listen(port, '0.0.0.0');
  Logger.verbose(`Application ${appName} is running on: ${await app.getUrl()}`);
}
bootstrap();

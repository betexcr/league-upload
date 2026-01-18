import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RequestLoggingMiddleware } from './common/request-logging.middleware';
import helmet from 'helmet';
import { json, urlencoded, raw, Request, Response, NextFunction } from 'express';
import { TimeoutInterceptor } from './common/timeout.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(new CorrelationIdMiddleware().use);
  app.use(new RequestLoggingMiddleware().use);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 10000);
  app.useGlobalInterceptors(new TimeoutInterceptor(timeoutMs));

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false
    })
  );
  const jsonBodyLimit = process.env.BODY_LIMIT ?? '1mb';
  const localStorageBodyLimit =
    process.env.LOCAL_STORAGE_BODY_LIMIT ??
    `${Number(process.env.MAX_FILE_MB ?? 200)}mb`;
  app.use('/v1/local-storage', raw({ type: '*/*', limit: localStorageBodyLimit }));
  app.use(json({ limit: jsonBodyLimit }));
  app.use(urlencoded({ extended: true, limit: jsonBodyLimit }));

  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';
  const devOrigins =
    origins.length === 0 && isDev ? true : origins;
  app.enableCors({
    origin: devOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'If-Match',
      'X-Correlation-Id',
      'X-Fail-Documents',
      'X-Fail-Uploads'
    ],
    maxAge: 600
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const method = req.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      if (req.originalUrl.startsWith('/v1/local-storage/multipart/')) {
        return next();
      }
      const contentType = req.headers['content-type'] ?? '';
      const hasBody = Number(req.headers['content-length'] ?? '0') > 0;
      if (hasBody && !contentType.toString().includes('application/json')) {
        return res.status(415).json({
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Content-Type must be application/json',
          traceId: req.headers['x-correlation-id']
        });
      }
    }
    return next();
  });
  app.setGlobalPrefix('v1');

  const config = new DocumentBuilder()
    .setTitle('League Upload Management API')
    .setDescription('API for League Upload Management System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port);
}

bootstrap();

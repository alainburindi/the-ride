import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // API versioning - global prefix (excludes health for k8s probes)
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/live', 'health/ready'],
  });

  // Enable validation pipes globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Enable CORS
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('The RIDE API')
    .setDescription(
      'Ride-sharing backend API with driver matching, trips, and real-time location tracking'
    )
    .setVersion('1.0')
    .addServer('/api/v1', 'API v1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'JWT'
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('drivers', 'Driver management endpoints')
    .addTag('rides', 'Ride request endpoints')
    .addTag('trips', 'Trip management endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  await app.listen(port);
  console.log(`🚀 REST API running on http://localhost:${port}/api/v1`);
  console.log(`📚 API docs available at http://localhost:${port}/docs`);
}

bootstrap();


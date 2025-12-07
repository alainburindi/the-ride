import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { LocationsModule } from './modules/locations/locations.module';
import { MatchingModule } from './modules/matching/matching.module';
import { TripsModule } from './modules/trips/trips.module';
import { RidesModule } from './modules/rides/rides.module';
import { WsModule } from './ws/ws.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { OsrmModule } from './common/osrm/osrm.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          // Short burst limit: 10 requests per second
          name: 'short',
          ttl: config.get<number>('THROTTLE_SHORT_TTL', 1000),
          limit: config.get<number>('THROTTLE_SHORT_LIMIT', 10),
        },
        {
          // Medium limit: 100 requests per minute
          name: 'medium',
          ttl: config.get<number>('THROTTLE_MEDIUM_TTL', 60000),
          limit: config.get<number>('THROTTLE_MEDIUM_LIMIT', 100),
        },
      ],
    }),
    PrismaModule,
    RedisModule,
    OsrmModule,
    HealthModule,
    AuthModule,
    DriversModule,
    LocationsModule,
    MatchingModule,
    TripsModule,
    RidesModule,
    WsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

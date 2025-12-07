import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
})
export class AppModule {}


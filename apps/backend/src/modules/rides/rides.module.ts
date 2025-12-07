import { Module, forwardRef } from '@nestjs/common';
import { RidesService } from './rides.service';
import { RidesController } from './rides.controller';
import { MatchingModule } from '../matching/matching.module';
import { TripsModule } from '../trips/trips.module';
import { WsModule } from '../../ws/ws.module';

@Module({
  imports: [
    MatchingModule,
    TripsModule,
    forwardRef(() => WsModule),
  ],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}


import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { LocationsModule } from '../locations/locations.module';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [LocationsModule, DriversModule],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}


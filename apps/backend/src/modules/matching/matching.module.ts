import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { LocationsModule } from '../locations/locations.module';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [LocationsModule, PrismaModule],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}

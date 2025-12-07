import { Global, Module } from '@nestjs/common';
import { OsrmService } from './osrm.service';

@Global()
@Module({
  providers: [OsrmService],
  exports: [OsrmService],
})
export class OsrmModule {}


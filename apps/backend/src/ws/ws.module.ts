import { Module, forwardRef } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { LocationsModule } from '../modules/locations/locations.module';
import { AuthModule } from '../modules/auth/auth.module';
import { DriversModule } from '../modules/drivers/drivers.module';
import { RidesModule } from '../modules/rides/rides.module';

@Module({
  imports: [
    LocationsModule,
    AuthModule,
    DriversModule,
    forwardRef(() => RidesModule),
  ],
  providers: [WsGateway],
  exports: [WsGateway],
})
export class WsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { LocationsModule } from '../modules/locations/locations.module';
import { AuthModule } from '../modules/auth/auth.module';
import { DriversModule } from '../modules/drivers/drivers.module';

@Module({
  imports: [LocationsModule, AuthModule, DriversModule],
  providers: [WsGateway],
  exports: [WsGateway],
})
export class WsModule {}


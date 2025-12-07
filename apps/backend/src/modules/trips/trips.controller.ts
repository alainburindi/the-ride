import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserData,
} from '../auth/decorators/current-user.decorator';
import { UpdateTripStateDto } from './dto/update-trip-state.dto';

@ApiTags('trips')
@ApiBearerAuth('JWT')
@Controller('trips')
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  async findAll(@CurrentUser() user: CurrentUserData) {
    return this.tripsService.findAll(user.userId, user.role);
  }

  @Get('active')
  async getActiveTrip(@CurrentUser() user: CurrentUserData) {
    return this.tripsService.getActiveTrip(user.userId, user.role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.tripsService.findOne(id);
  }

  @Patch(':id/state')
  async updateState(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateTripStateDto,
  ) {
    return this.tripsService.updateState(id, user.userId, user.role, dto);
  }
}


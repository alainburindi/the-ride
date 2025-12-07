import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RidesService } from './rides.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateRideRequestDto } from './dto/create-ride-request.dto';
import { UserRole } from '@prisma/client';

@ApiTags('rides')
@ApiBearerAuth('JWT')
@Controller('rides')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Post('request')
  @Roles(UserRole.RIDER)
  async createRequest(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateRideRequestDto,
  ) {
    return this.ridesService.createRideRequest(userId, dto);
  }

  @Get('requests')
  @Roles(UserRole.RIDER)
  async getMyRequests(@CurrentUser('userId') userId: string) {
    return this.ridesService.getUserRequests(userId);
  }

  @Get('request/:id')
  async getRequest(@Param('id') id: string) {
    return this.ridesService.getRequest(id);
  }

  @Delete('request/:id')
  @Roles(UserRole.RIDER)
  async cancelRequest(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.ridesService.cancelRequest(id, userId);
  }
}


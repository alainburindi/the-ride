import { IsEnum } from 'class-validator';
import { TripState } from '@prisma/client';

export class UpdateTripStateDto {
  @IsEnum(TripState)
  state: TripState;
}


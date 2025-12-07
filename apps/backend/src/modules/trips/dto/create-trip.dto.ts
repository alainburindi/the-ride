import { IsString, IsNumber, IsObject, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class CoordinatesDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lon: number;
}

export class CreateTripDto {
  @IsString()
  rideRequestId: string;

  @IsString()
  riderId: string;

  @IsString()
  driverId: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  origin: CoordinatesDto;

  @IsObject()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  destination: CoordinatesDto;

  @IsOptional()
  @IsNumber()
  pickupEtaSec?: number;

  @IsOptional()
  @IsNumber()
  tripEtaSec?: number;

  @IsOptional()
  @IsNumber()
  distanceMeters?: number;
}


import { IsObject, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class CoordinatesDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lon: number;
}

export class CreateRideRequestDto {
  @IsObject()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  origin: CoordinatesDto;

  @IsObject()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  destination: CoordinatesDto;
}


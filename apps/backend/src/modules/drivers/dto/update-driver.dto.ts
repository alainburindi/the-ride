import { IsOptional, IsObject } from 'class-validator';

export class UpdateDriverDto {
  @IsOptional()
  @IsObject()
  vehicleInfo?: Record<string, unknown>;
}


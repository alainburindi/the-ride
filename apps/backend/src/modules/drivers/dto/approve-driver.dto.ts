import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DriverApprovalStatus } from '@prisma/client';

export class ApproveDriverDto {
  @IsEnum(DriverApprovalStatus)
  status: DriverApprovalStatus;

  @IsOptional()
  @IsString()
  rejectionNote?: string;
}

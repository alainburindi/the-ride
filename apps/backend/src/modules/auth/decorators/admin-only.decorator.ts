import { applyDecorators, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

/**
 * Convenience decorator that combines JWT auth + ADMIN role check
 * Usage: @AdminOnly() on controller methods or classes
 */
export const AdminOnly = () =>
  applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(UserRole.ADMIN));

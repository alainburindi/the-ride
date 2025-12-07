import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { OsrmService } from '../common/osrm/osrm.service';
import { RedisService } from '../common/redis/redis.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly osrmService: OsrmService,
    private readonly redis: RedisService
  ) {}

  @Get()
  async check() {
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        redis: false,
        osrm: false,
      },
    };

    // Check Redis
    try {
      await this.redis.getClient().ping();
      checks.services.redis = true;
    } catch {
      checks.status = 'degraded';
    }

    // Check OSRM
    try {
      checks.services.osrm = await this.osrmService.healthCheck();
    } catch {
      checks.status = 'degraded';
    }

    return checks;
  }

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    // Check if all dependencies are ready
    try {
      await this.redis.getClient().ping();
      return { status: 'ready' };
    } catch {
      return { status: 'not_ready' };
    }
  }
}

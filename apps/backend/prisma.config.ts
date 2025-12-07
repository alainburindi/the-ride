import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

// Prisma 7 config for migrations and database connection
export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  datasource: {
    url: process.env.DATABASE_URL!,
  },

  migrate: {
    async adapter() {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      return new PrismaPg(pool);
    },
  },
} as Parameters<typeof defineConfig>[0]);


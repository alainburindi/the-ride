import {
  PrismaClient,
  UserRole,
  DriverStatus,
  DriverApprovalStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.trip.deleteMany();
  await prisma.rideRequest.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.user.deleteMany();

  console.log('✓ Cleared existing data');

  // Default password for all seed users
  const defaultPassword = await hashPassword('password123');

  // ==================== Create Admin ====================
  const admin = await prisma.user.create({
    data: {
      email: 'admin@theride.com',
      passwordHash: defaultPassword,
      role: UserRole.ADMIN,
    },
  });
  console.log('✓ Created admin:', admin.email);

  // ==================== Create Riders ====================
  const riders = await Promise.all([
    prisma.user.create({
      data: {
        email: 'rider1@example.com',
        passwordHash: defaultPassword,
        role: UserRole.RIDER,
      },
    }),
    prisma.user.create({
      data: {
        email: 'rider2@example.com',
        passwordHash: defaultPassword,
        role: UserRole.RIDER,
      },
    }),
    prisma.user.create({
      data: {
        email: 'rider3@example.com',
        passwordHash: defaultPassword,
        role: UserRole.RIDER,
      },
    }),
  ]);
  console.log(`✓ Created ${riders.length} riders`);

  // ==================== Create Drivers ====================
  // Approved drivers
  const approvedDriver1 = await prisma.user.create({
    data: {
      email: 'driver1@example.com',
      passwordHash: defaultPassword,
      role: UserRole.DRIVER,
      driver: {
        create: {
          vehicleInfo: {
            plate: 'RAC 123A',
            model: 'Toyota Corolla',
            color: 'White',
            year: 2020,
          },
          status: DriverStatus.OFFLINE,
          approvalStatus: DriverApprovalStatus.APPROVED,
          approvedBy: admin.id,
          approvedAt: new Date(),
        },
      },
    },
    include: { driver: true },
  });

  const approvedDriver2 = await prisma.user.create({
    data: {
      email: 'driver2@example.com',
      passwordHash: defaultPassword,
      role: UserRole.DRIVER,
      driver: {
        create: {
          vehicleInfo: {
            plate: 'RAD 456B',
            model: 'Honda Civic',
            color: 'Silver',
            year: 2021,
          },
          status: DriverStatus.OFFLINE,
          approvalStatus: DriverApprovalStatus.APPROVED,
          approvedBy: admin.id,
          approvedAt: new Date(),
        },
      },
    },
    include: { driver: true },
  });

  const approvedDriver3 = await prisma.user.create({
    data: {
      email: 'driver3@example.com',
      passwordHash: defaultPassword,
      role: UserRole.DRIVER,
      driver: {
        create: {
          vehicleInfo: {
            plate: 'RAF 789C',
            model: 'Nissan Sentra',
            color: 'Black',
            year: 2019,
          },
          status: DriverStatus.OFFLINE,
          approvalStatus: DriverApprovalStatus.APPROVED,
          approvedBy: admin.id,
          approvedAt: new Date(),
        },
      },
    },
    include: { driver: true },
  });

  console.log('✓ Created 3 approved drivers');

  // Pending drivers (waiting for admin approval)
  const pendingDriver1 = await prisma.user.create({
    data: {
      email: 'pending1@example.com',
      passwordHash: defaultPassword,
      role: UserRole.DRIVER,
      driver: {
        create: {
          vehicleInfo: {
            plate: 'RAG 111D',
            model: 'Hyundai Elantra',
            color: 'Blue',
            year: 2022,
          },
          status: DriverStatus.OFFLINE,
          approvalStatus: DriverApprovalStatus.PENDING,
        },
      },
    },
    include: { driver: true },
  });

  const pendingDriver2 = await prisma.user.create({
    data: {
      email: 'pending2@example.com',
      passwordHash: defaultPassword,
      role: UserRole.DRIVER,
      driver: {
        create: {
          vehicleInfo: {
            plate: 'RAH 222E',
            model: 'Kia Rio',
            color: 'Red',
            year: 2023,
          },
          status: DriverStatus.OFFLINE,
          approvalStatus: DriverApprovalStatus.PENDING,
        },
      },
    },
    include: { driver: true },
  });

  console.log('✓ Created 2 pending drivers');

  // Rejected driver
  await prisma.user.create({
    data: {
      email: 'rejected@example.com',
      passwordHash: defaultPassword,
      role: UserRole.DRIVER,
      driver: {
        create: {
          vehicleInfo: {
            plate: 'RAI 333F',
            model: 'Unknown',
            color: 'Unknown',
            year: 2010,
          },
          status: DriverStatus.OFFLINE,
          approvalStatus: DriverApprovalStatus.REJECTED,
          rejectionNote: 'Vehicle does not meet safety requirements',
        },
      },
    },
  });

  console.log('✓ Created 1 rejected driver');

  // ==================== Summary ====================
  console.log('\n📊 Seed Summary:');
  console.log('================');
  console.log('Admin:    admin@theride.com');
  console.log(
    'Riders:   rider1@example.com, rider2@example.com, rider3@example.com'
  );
  console.log(
    'Drivers:  driver1@example.com, driver2@example.com, driver3@example.com (approved)'
  );
  console.log('Pending:  pending1@example.com, pending2@example.com');
  console.log('Rejected: rejected@example.com');
  console.log('================');
  console.log('Password for all accounts: password123');
  console.log('\n✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

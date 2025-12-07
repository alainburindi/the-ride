-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('RIDER', 'DRIVER', 'ADMIN');

-- CreateEnum
CREATE TYPE "DriverApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('ONLINE', 'OFFLINE', 'BUSY');

-- CreateEnum
CREATE TYPE "TripState" AS ENUM ('MATCHING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RideRequestStatus" AS ENUM ('PENDING', 'MATCHING', 'MATCHED', 'EXPIRED', 'CANCELED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_info" JSONB,
    "status" "DriverStatus" NOT NULL DEFAULT 'OFFLINE',
    "approval_status" "DriverApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_requests" (
    "id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "origin_lat" DOUBLE PRECISION NOT NULL,
    "origin_lon" DOUBLE PRECISION NOT NULL,
    "destination_lat" DOUBLE PRECISION NOT NULL,
    "destination_lon" DOUBLE PRECISION NOT NULL,
    "status" "RideRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "ride_request_id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "origin_lat" DOUBLE PRECISION NOT NULL,
    "origin_lon" DOUBLE PRECISION NOT NULL,
    "destination_lat" DOUBLE PRECISION NOT NULL,
    "destination_lon" DOUBLE PRECISION NOT NULL,
    "state" "TripState" NOT NULL DEFAULT 'ASSIGNED',
    "pickup_eta_sec" INTEGER,
    "trip_eta_sec" INTEGER,
    "distance_meters" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trips_ride_request_id_key" ON "trips"("ride_request_id");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_ride_request_id_fkey" FOREIGN KEY ("ride_request_id") REFERENCES "ride_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

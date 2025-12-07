#!/bin/sh
set -e

echo "Running database migrations..."
yarn prisma migrate deploy

echo "Starting application..."
exec node dist/main


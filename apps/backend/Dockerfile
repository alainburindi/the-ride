# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Install yarn
RUN corepack enable && corepack prepare yarn@stable --activate

# Copy package files and Prisma config
COPY package.json yarn.lock ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Generate Prisma client
RUN yarn prisma generate

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Production stage
FROM node:24-alpine AS production

WORKDIR /app

# Install yarn
RUN corepack enable && corepack prepare yarn@stable --activate

# Copy package files and install production dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

# Copy Prisma files and generate client
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN yarn prisma generate

# Copy built application
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production

# Expose ports
EXPOSE 3000 3001

# Health check using curl (more reliable in alpine)
RUN apk add --no-cache curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/main"]


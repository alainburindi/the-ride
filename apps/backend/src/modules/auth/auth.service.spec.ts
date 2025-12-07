import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRole } from '@prisma/client';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: jest.Mocked<PrismaService>;
  let jwtService: jest.Mocked<JwtService>;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    driver: {
      create: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService);
    jwtService = module.get(JwtService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'password123',
      role: UserRole.RIDER,
    };

    it('should register a new rider successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-123',
        email: registerDto.email,
        role: UserRole.RIDER,
      });
      mockJwtService.sign.mockReturnValue('jwt_token');

      const result = await service.register(registerDto);

      expect(result.access_token).toBe('jwt_token');
      expect(result.role).toBe(UserRole.RIDER);
      expect(result.userId).toBe('user-123');
      expect(mockPrismaService.driver.create).not.toHaveBeenCalled();
    });

    it('should register a new driver with driver profile', async () => {
      const driverDto = {
        ...registerDto,
        role: UserRole.DRIVER,
        vehicleInfo: { make: 'Toyota', model: 'Corolla' },
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-123',
        email: driverDto.email,
        role: UserRole.DRIVER,
      });
      mockPrismaService.driver.create.mockResolvedValue({
        id: 'driver-123',
        userId: 'user-123',
      });
      mockJwtService.sign.mockReturnValue('jwt_token');

      const result = await service.register(driverDto);

      expect(result.role).toBe(UserRole.DRIVER);
      expect(mockPrismaService.driver.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          vehicleInfo: driverDto.vehicleInfo,
        },
      });
    });

    it('should throw ConflictException if email exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: registerDto.email,
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should login successfully with valid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: loginDto.email,
        passwordHash: 'hashed_password',
        role: UserRole.RIDER,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('jwt_token');

      const result = await service.login(loginDto);

      expect(result.access_token).toBe('jwt_token');
      expect(result.userId).toBe('user-123');
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: loginDto.email,
        passwordHash: 'hashed_password',
        role: UserRole.RIDER,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('validateUser', () => {
    it('should return user with driver info if exists', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: UserRole.DRIVER,
        driver: { id: 'driver-123' },
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.validateUser('user-123');

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        include: { driver: true },
      });
    });

    it('should return null for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: UserRole.RIDER,
      };
      mockJwtService.verify.mockReturnValue(payload);

      const result = service.verifyToken('valid_token');

      expect(result).toEqual(payload);
    });

    it('should throw UnauthorizedException for invalid token', () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => service.verifyToken('invalid_token')).toThrow(
        UnauthorizedException
      );
    });
  });
});

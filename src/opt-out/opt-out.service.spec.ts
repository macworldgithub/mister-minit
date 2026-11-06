import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { OptOutService, INTERNAL_BLOCKED_NUMBERS } from './opt-out.service';
import { OptOut } from './opt-out.schema';

describe('OptOutService', () => {
  let service: OptOutService;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = {
      exists: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ deletedCount: 1 }) }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptOutService,
        {
          provide: getModelToken(OptOut.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<OptOutService>(OptOutService);
  });

  describe('isOptedOut', () => {
    it('should return true for internal permanent blocklist numbers without calling DB', async () => {
      expect(await service.isOptedOut('0405434292')).toBe(true);
      expect(await service.isOptedOut('+61405434292')).toBe(true);
      expect(await service.isOptedOut('0405 434 292')).toBe(true);

      expect(await service.isOptedOut('0406500312')).toBe(true);
      expect(await service.isOptedOut('+61406500312')).toBe(true);
      expect(await service.isOptedOut('0406 500 312')).toBe(true);

      expect(mockModel.exists).not.toHaveBeenCalled();
    });

    it('should check DB for regular numbers and return true if found', async () => {
      mockModel.exists.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue({ _id: 'opt1' }) });
      const result = await service.isOptedOut('0412345678');
      expect(result).toBe(true);
      expect(mockModel.exists).toHaveBeenCalled();
    });

    it('should check DB for regular numbers and return false if not found', async () => {
      mockModel.exists.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) });
      const result = await service.isOptedOut('0412345678');
      expect(result).toBe(false);
      expect(mockModel.exists).toHaveBeenCalled();
    });
  });

  describe('blockNumber', () => {
    it('should record manual block in DB if not already existing', async () => {
      mockModel.exists.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) });
      const res = await service.blockNumber('0499 888 777');
      expect(res.success).toBe(true);
      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          callerNumber: '0499888777',
          keyword: 'INTERNAL_BLOCK',
          source: 'manual_suppression',
        }),
      );
    });
  });

  describe('removeOptOut', () => {
    it('should remove number variations from DB', async () => {
      const res = await service.removeOptOut('0499 888 777');
      expect(res.success).toBe(true);
      expect(mockModel.deleteMany).toHaveBeenCalled();
    });
  });
});

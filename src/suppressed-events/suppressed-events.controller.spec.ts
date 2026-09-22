import { Test, TestingModule } from '@nestjs/testing';
import { SuppressedEventsController } from './suppressed-events.controller';
import { SuppressedEventsService } from './suppressed-events.service';
import { OptOutService } from '../opt-out/opt-out.service';

describe('SuppressedEventsController', () => {
  let controller: SuppressedEventsController;

  const mockSuppressedEventsService = {
    findSuppressedEvents: jest.fn(),
    getSuppressionSummary: jest.fn(),
  };

  const mockOptOutService = {
    findOptOuts: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuppressedEventsController],
      providers: [
        {
          provide: SuppressedEventsService,
          useValue: mockSuppressedEventsService,
        },
        {
          provide: OptOutService,
          useValue: mockOptOutService,
        },
      ],
    }).compile();

    controller = module.get<SuppressedEventsController>(SuppressedEventsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call findSuppressedEvents on GET /suppressions', async () => {
    const mockResult = { total: 1, limit: 50, skip: 0, events: [{ id: 'evt-1' }] };
    mockSuppressedEventsService.findSuppressedEvents.mockResolvedValue(mockResult);

    const result = await controller.getSuppressedEvents(undefined, undefined, undefined, '0412345678');
    expect(mockSuppressedEventsService.findSuppressedEvents).toHaveBeenCalledWith(
      expect.objectContaining({ search: '0412345678' }),
    );
    expect(result).toEqual(mockResult);
  });

  it('should call findOptOuts on GET /suppressions/opt-outs', async () => {
    const mockResult = { total: 1, limit: 50, skip: 0, optOuts: [{ id: 'opt-1' }] };
    mockOptOutService.findOptOuts.mockResolvedValue(mockResult);

    const result = await controller.getOptOuts('0412345678');
    expect(mockOptOutService.findOptOuts).toHaveBeenCalledWith(
      expect.objectContaining({ search: '0412345678' }),
    );
    expect(result).toEqual(mockResult);
  });

  it('should return combined summary on GET /suppressions/summary', async () => {
    mockSuppressedEventsService.getSuppressionSummary.mockResolvedValue({
      totalSuppressed: 10,
      byReason: { not_mobile: 8, not_missed_call: 2 },
    });
    mockOptOutService.findOptOuts.mockResolvedValue({ total: 3, optOuts: [] });

    const result = await controller.getSummary();
    expect(result).toEqual({
      totalSuppressed: 10,
      byReason: { not_mobile: 8, not_missed_call: 2 },
      totalOptOuts: 3,
    });
  });
});

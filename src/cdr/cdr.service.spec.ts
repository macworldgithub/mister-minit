import { Test, TestingModule } from '@nestjs/testing';
import { CdrService } from './cdr.service';

describe('CdrService', () => {
  let service: CdrService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CdrService],
    }).compile();

    service = module.get<CdrService>(CdrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

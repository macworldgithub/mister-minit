import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { CdrService } from './cdr.service';
import { CreateCdrDto } from './cdr.dto';

@Controller('cdr')
export class CdrController {
  constructor(private readonly cdrService: CdrService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async create(@Body() createCdrDto: CreateCdrDto) {
    await this.cdrService.saveCdr(createCdrDto);
    return { success: true };
  }
}

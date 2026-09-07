import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { StaffContactDto } from './create-store-config.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateStoreConfigDto {
  @ApiPropertyOptional({ example: 'Mister Minit Westfield Doncaster', description: 'Full store name' })
  @IsOptional()
  @IsString()
  storeName?: string;

  @ApiPropertyOptional({ example: 'Kiosk 204 Westfield, 297 Diagonal Rd, Oaklands Park SA 5046', description: 'Short address summary' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Mon-Wed & Fri 9:00am–5:30pm, Thu 9:00am–9:00pm, Sat 9:00am–5:00pm, Sun 11:00am–5:00pm', description: 'Full trading hours string' })
  @IsOptional()
  @IsString()
  tradingHours?: string;

  @ApiPropertyOptional({ example: 'https://goo.gl/maps/example', description: 'Store-specific Google Maps short link' })
  @IsOptional()
  @IsString()
  googleMapsLink?: string;

  @ApiPropertyOptional({ type: [StaffContactDto], description: 'List of staff contacts for this store' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffContactDto)
  staffContacts?: StaffContactDto[];

  @ApiPropertyOptional({ example: true, description: 'Whether this store is active in the pilot program' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateCdrDto {
  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsNotEmpty()
  @IsString()
  callid: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  'time-start'?: string;

  @IsOptional()
  @IsString()
  'time-answered'?: string;

  @IsOptional()
  @IsString()
  'time-end'?: string;

  @IsOptional()
  @IsString()
  'reason-terminated'?: string;

  @IsOptional()
  @IsString()
  'from-no'?: string;

  @IsOptional()
  @IsString()
  'from-dn'?: string;

  @IsOptional()
  @IsString()
  'dial-no'?: string;
}

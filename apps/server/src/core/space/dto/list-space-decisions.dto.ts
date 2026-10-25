import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListSpaceDecisionsDto {
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @IsOptional()
  @IsIn(['all', 'undecided', 'decided'])
  status?: 'all' | 'undecided' | 'decided';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

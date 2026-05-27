import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RemoveObjectDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'File ảnh đầu vào (PNG, JPG, WebP)',
  })
  @IsOptional()
  image: Express.Multer.File;

  @ApiProperty({
    example: 'Remove the person in the center',
    required: false,
    description: 'Prompt mô tả đối tượng cần xoá khỏi ảnh',
  })
  @IsOptional()
  @IsString({ message: 'Prompt phải là một chuỗi ký tự.' })
  prompt?: string;

  @ApiProperty({
    example: '{"maskBlur": 8, "guidanceScale": 7.5}',
    required: false,
    description:
      'Tuỳ chọn bổ sung cho pipeline remove-object ở dạng JSON string',
  })
  @IsOptional()
  @IsString({ message: 'Options phải là một chuỗi JSON hợp lệ.' })
  options?: string;
}

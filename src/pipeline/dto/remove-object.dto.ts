import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class RemoveObjectDto {
  @ApiProperty({
    type: 'string',
    description: 'URL của ảnh đã được đẩy lên S3 trước',
  })
  @IsString()
  @IsNotEmpty()
  imageUrl: string;

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

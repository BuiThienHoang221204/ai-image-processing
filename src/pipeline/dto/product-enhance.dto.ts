import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class ProductEnhanceDto {
  @ApiProperty({
    type: 'string',
    description: 'URL của ảnh đã được đẩy lên S3 trước',
  })
  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @ApiProperty({
    example: 'white',
    default: 'white',
    required: false,
    description:
      'Màu nền cần đổi (ví dụ: white, black, transparent, hoặc mã hex như #F3F4F6)',
  })
  @IsOptional()
  @IsString({ message: 'backgroundColor phải là một chuỗi ký tự.' })
  backgroundColor?: string;

  @ApiProperty({
    example:
      '{"brightness": 1.15, "contrast": 1.0, "sharpen": true, "crop": true}',
    required: false,
    description:
      'Các tùy chọn xử lý ảnh bằng Sharp. Ví dụ: brightness, contrast, sharpen, crop, resizeWidth, resizeHeight',
  })
  @IsOptional()
  @IsString({ message: 'Options phải là một chuỗi JSON hợp lệ.' })
  options?: string;
}

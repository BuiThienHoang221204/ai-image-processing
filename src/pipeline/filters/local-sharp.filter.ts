import { IFilter } from '../interfaces/filter.interface';
import { PipelineContext } from '../pipeline.context';
import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class LocalSharpFilter implements IFilter {
  readonly name = 'LocalSharpFilter';
  private readonly logger = new Logger(LocalSharpFilter.name);

  async execute(context: PipelineContext): Promise<PipelineContext> {
    this.logger.log(
      `[LocalSharpFilter] Đang tinh chỉnh chất lượng ảnh bằng Sharp cho Context: ${context.id}`,
    );

    const options = context.options;
    // Đọc các tùy chọn xử lý từ context options
    const brightness =
      typeof options.brightness === 'string'
        ? parseFloat(options.brightness)
        : typeof options.brightness === 'number'
          ? options.brightness
          : 1.0;
    const contrast =
      typeof options.contrast === 'string'
        ? parseFloat(options.contrast)
        : typeof options.contrast === 'number'
          ? options.contrast
          : 1.0;
    const sharpen = options.sharpen === true;
    const crop = options.crop === true;
    const backgroundColor =
      typeof options.backgroundColor === 'string'
        ? options.backgroundColor
        : undefined;
    const resizeWidth =
      typeof options.resizeWidth === 'string'
        ? parseInt(options.resizeWidth, 10)
        : typeof options.resizeWidth === 'number'
          ? options.resizeWidth
          : undefined;
    const resizeHeight =
      typeof options.resizeHeight === 'string'
        ? parseInt(options.resizeHeight, 10)
        : typeof options.resizeHeight === 'number'
          ? options.resizeHeight
          : undefined;

    const inputPath = context.currentImageUrl;

    // Kiểm tra xem file đầu vào có tồn tại trên local disk không
    if (!fs.existsSync(inputPath)) {
      this.logger.error(
        `[LocalSharpFilter] Không tìm thấy file nguồn tại đường dẫn: ${inputPath}`,
      );
      throw new Error(`File nguồn không tồn tại tại: ${inputPath}`);
    }

    // Đảm bảo thư mục lưu kết quả tồn tại
    const outputDir = path.join(process.cwd(), 'public', 'temp');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const ext = path.extname(inputPath) || '.png';
    const outputFileName = `sharp_${context.id}_${Date.now()}${ext}`;
    const outputPath = path.join(outputDir, outputFileName);

    try {
      let imagePipeline = sharp(inputPath);

      // 1. Chỉnh độ sáng (brightness) và độ tương phản (contrast)
      if (brightness !== 1.0) {
        imagePipeline = imagePipeline.modulate({ brightness: brightness });
      }

      // 2. Chỉnh độ sắc nét (sharpen)
      if (sharpen) {
        imagePipeline = imagePipeline.sharpen({ sigma: 1.0 });
      }

      // 3. Tự động crop bỏ viền trống thừa (trim)
      if (crop) {
        imagePipeline = imagePipeline.trim({ threshold: 10 });
      }

      // 4. Thay đổi kích thước (resize) nếu có yêu cầu
      if (resizeWidth || resizeHeight) {
        imagePipeline = imagePipeline.resize({
          width: resizeWidth,
          height: resizeHeight,
          fit: 'contain',
          background: backgroundColor || { r: 255, g: 255, b: 255, alpha: 0 },
        });
      }

      // 5. Thêm nền (nếu được chỉ định màu nền và ảnh có kênh alpha)
      if (backgroundColor) {
        let flattenColor = '#FFFFFF';
        if (backgroundColor === 'white') {
          flattenColor = '#FFFFFF';
        } else if (backgroundColor === 'black') {
          flattenColor = '#000000';
        } else {
          flattenColor = backgroundColor;
        }

        imagePipeline = imagePipeline.flatten({ background: flattenColor });
      }

      // Thực thi và lưu kết quả xuống đĩa cứng
      await imagePipeline.toFile(outputPath);

      // Cập nhật đường dẫn hình ảnh hiện tại trong context
      context.currentImageUrl = outputPath;

      // Lưu lại thông tin xử lý vào metadata
      context.metadata[this.name] = {
        appliedBrightness: brightness,
        appliedContrast: contrast,
        appliedSharpen: sharpen,
        appliedCrop: crop,
        appliedBackgroundColor: backgroundColor || 'none',
        resize:
          resizeWidth || resizeHeight
            ? { width: resizeWidth, height: resizeHeight }
            : 'none',
        outputFile: outputPath,
        processingEngine: 'Sharp C++',
      };

      this.logger.log(
        `[LocalSharpFilter] Xử lý thành công. File đã lưu tại: ${outputPath}`,
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[LocalSharpFilter] Lỗi xử lý qua sharp: ${err.message}`,
      );
      throw err;
    }

    return context;
  }
}

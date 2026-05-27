import { IFilter } from '../interfaces/filter.interface';
import { PipelineContext } from '../pipeline.context';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class LocalInpaintFilter implements IFilter {
  readonly name = 'LocalInpaintFilter';
  private readonly logger = new Logger(LocalInpaintFilter.name);

  async execute(context: PipelineContext): Promise<PipelineContext> {
    this.logger.log(
      `[LocalInpaintFilter] Bắt đầu bước xóa vật thể bằng Python Local Inpaint...`,
    );

    // 1. Lấy thông tin tọa độ từ filter OpenRouterDetectFilter trước đó
    const detectMetadata = context.metadata['OpenRouterDetectFilter'] as
      | Record<string, unknown>
      | undefined;
    if (!detectMetadata || !Array.isArray(detectMetadata.detectedBox)) {
      this.logger.warn(
        `[LocalInpaintFilter] Không tìm thấy tọa độ vật thể từ bước trước. Bỏ qua.`,
      );
      return context;
    }

    const box = detectMetadata.detectedBox as number[]; // [ymin, xmin, ymax, xmax] trong khoảng [0, 1000]

    // Nếu tọa độ là [0, 0, 0, 0] nghĩa là không tìm thấy vật thể cần xóa
    if (box[0] === 0 && box[1] === 0 && box[2] === 0 && box[3] === 0) {
      this.logger.log(
        `[LocalInpaintFilter] Tọa độ rỗng [0,0,0,0]. Không cần thực hiện xóa.`,
      );
      return context;
    }

    const inputPath = context.currentImageUrl;
    if (!fs.existsSync(inputPath)) {
      throw new Error(
        `[LocalInpaintFilter] Không tìm thấy file nguồn tại: ${inputPath}`,
      );
    }

    const outputDir = path.join(process.cwd(), 'public', 'temp');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const ext = path.extname(inputPath) || '.png';
    const maskPath = path.join(
      outputDir,
      `mask_${context.id}_${Date.now()}.png`,
    );
    const outputPath = path.join(
      outputDir,
      `inpaint_${context.id}_${Date.now()}${ext}`,
    );

    // Đường dẫn API Python worker, mặc định cổng 8000
    const workerUrl =
      process.env.PYTHON_BG_REMOVAL_URL?.replace('/remove-bg', '/inpaint') ||
      'http://localhost:8000/inpaint';

    try {
      // 2. Tự động resize ảnh gốc nếu ảnh quá lớn để bảo vệ RAM của AI Worker
      const metadata = await sharp(inputPath).metadata();
      const origWidth = metadata.width || 1024;
      const origHeight = metadata.height || 1024;
      const maxDimension = Math.max(origWidth, origHeight);
      const maxAllowed = 1024;

      let width = origWidth;
      let height = origHeight;
      let isResized = false;
      let processingInputPath = inputPath;

      if (maxDimension > maxAllowed) {
        this.logger.log(
          `[LocalInpaintFilter] Ảnh gốc lớn (${origWidth}x${origHeight}). Tự động resize xuống max ${maxAllowed}px trước khi inpaint để tránh sập RAM EC2...`,
        );
        const tempResizedPath = path.join(
          outputDir,
          `temp_resize_inpaint_${context.id}_${Date.now()}.jpg`,
        );

        const ratio = maxAllowed / maxDimension;
        width = Math.round(origWidth * ratio);
        height = Math.round(origHeight * ratio);

        await sharp(inputPath).resize(width, height).toFile(tempResizedPath);

        context.tempFiles.push(tempResizedPath);
        processingInputPath = tempResizedPath;
        isResized = true;
      }

      // Chuyển đổi tọa độ tương đối (0..1000) sang pixel tuyệt đối theo kích thước xử lý thực tế
      const yMinPx = Math.round((box[0] / 1000) * height);
      const xMinPx = Math.round((box[1] / 1000) * width);
      const yMaxPx = Math.round((box[2] / 1000) * height);
      const xMaxPx = Math.round((box[3] / 1000) * width);

      const rectWidth = xMaxPx - xMinPx;
      const rectHeight = yMaxPx - yMinPx;

      this.logger.log(
        `[LocalInpaintFilter] Tạo mask size: ${width}x${height}, Bounding Box: x=${xMinPx}, y=${yMinPx}, w=${rectWidth}, h=${rectHeight}`,
      );

      // Tạo chuỗi SVG vẽ hình chữ nhật màu trắng trên nền đen
      const svgMask = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
          <rect x="0" y="0" width="${width}" height="${height}" fill="black" />
          <rect x="${xMinPx}" y="${yMinPx}" width="${rectWidth}" height="${rectHeight}" fill="white" />
        </svg>
      `;

      // Lưu file mask PNG
      await sharp(Buffer.from(svgMask)).png().toFile(maskPath);
      context.tempFiles.push(maskPath);

      this.logger.log(
        `[LocalInpaintFilter] Mask đã được tạo thành công tại: ${maskPath}`,
      );

      // 3. Đọc dữ liệu ảnh gốc (đã resize nếu cần) và mask làm FormData để gửi qua Python Worker
      const imgBuffer = fs.readFileSync(processingInputPath);
      const maskBuffer = fs.readFileSync(maskPath);

      const formData = new FormData();
      formData.append('image', imgBuffer, {
        filename: path.basename(processingInputPath),
        contentType: 'image/jpeg',
      });
      formData.append('mask', maskBuffer, {
        filename: path.basename(maskPath),
        contentType: 'image/png',
      });

      this.logger.log(
        `[LocalInpaintFilter] Đang gửi ảnh và mask sang Python Worker tại ${workerUrl}...`,
      );

      // Gọi API Python Worker để thực hiện inpaint xóa đối tượng
      const response = await axios.post(workerUrl, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        responseType: 'arraybuffer',
        timeout: 120000, // 2 phút
      });

      // Lưu kết quả nhận về vào file outputPath (Khôi phục kích thước nếu đã resize)
      if (isResized) {
        this.logger.log(
          `[LocalInpaintFilter] Inpaint hoàn tất. Đang khôi phục kích thước ảnh về gốc (${origWidth}x${origHeight})...`,
        );
        await sharp(Buffer.from(response.data as ArrayBuffer))
          .resize(origWidth, origHeight, { fit: 'fill' })
          .toFile(outputPath);
      } else {
        fs.writeFileSync(outputPath, Buffer.from(response.data as ArrayBuffer));
      }
      context.tempFiles.push(outputPath);

      this.logger.log(
        `[LocalInpaintFilter] Inpainting local thành công! File lưu tại: ${outputPath}`,
      );

      // Cập nhật context
      context.currentImageUrl = outputPath;
      context.metadata[this.name] = {
        inpaintingModel: 'opencv-telea-local',
        workerUrl: workerUrl,
        maskFile: maskPath,
        outputFile: outputPath,
        status: 'SUCCESS',
      };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[LocalInpaintFilter] Lỗi khi thực hiện local inpainting: ${err.message}`,
      );
      throw err;
    }

    return context;
  }
}

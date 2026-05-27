import { IFilter } from '../interfaces/filter.interface';
import { PipelineContext } from '../pipeline.context';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LocalRembgFilter implements IFilter {
  readonly name = 'LocalRembgFilter';
  private readonly logger = new Logger(LocalRembgFilter.name);

  async execute(context: PipelineContext): Promise<PipelineContext> {
    this.logger.log(
      `[LocalRembgFilter] Bắt đầu bóc tách nền bằng Python AI Worker (rembg U2Net)...`,
    );

    const inputPath = context.currentImageUrl;

    if (!fs.existsSync(inputPath)) {
      throw new Error(
        `[LocalRembgFilter] Không tìm thấy file nguồn tại: ${inputPath}`,
      );
    }

    // Đảm bảo thư mục lưu kết quả tồn tại
    const outputDir = path.join(process.cwd(), 'public', 'temp');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(
      outputDir,
      `rembg_${context.id}_${Date.now()}.png`,
    );

    // Đọc URL Python Worker từ biến môi trường, mặc định cổng 8000
    const workerUrl =
      process.env.PYTHON_BG_REMOVAL_URL || 'http://localhost:8000/remove-bg';

    try {
      // Kiểm tra Python Worker có đang hoạt động hay không
      const healthUrl = workerUrl.replace('/remove-bg', '/health');
      try {
        await axios.get(healthUrl, { timeout: 3000 });
        this.logger.log(
          `[LocalRembgFilter] Python Worker đang hoạt động tại: ${workerUrl}`,
        );
      } catch {
        throw new Error(
          `Python Worker không phản hồi tại ${healthUrl}. Vui lòng khởi động Worker bằng lệnh: cd python_worker && uvicorn main:app --port 8000`,
        );
      }

      // Đọc file ảnh và tạo FormData để gửi sang Python Worker
      const fileBuffer = fs.readFileSync(inputPath);
      const formData = new FormData();
      formData.append('image', fileBuffer, {
        filename: path.basename(inputPath),
        contentType: 'image/jpeg',
      });

      this.logger.log(
        `[LocalRembgFilter] Đang gửi ảnh sang Python Worker để tách nền AI...`,
      );

      // Gọi API Python Worker
      const response = await axios.post(workerUrl, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        responseType: 'arraybuffer',
        timeout: 120000, // 2 phút timeout để AI xử lý
      });

      // Ghi ảnh PNG trong suốt vào thư mục temp
      fs.writeFileSync(outputPath, Buffer.from(response.data as ArrayBuffer));

      this.logger.log(
        `[LocalRembgFilter] Tách nền thành công bằng AI U2Net! File lưu tại: ${outputPath}`,
      );

      // Cập nhật đường dẫn ảnh trong context
      context.currentImageUrl = outputPath;
      context.metadata[this.name] = {
        bgRemovalModel: 'rembg-u2net-local',
        workerUrl: workerUrl,
        inputFile: inputPath,
        outputFile: outputPath,
        outputFormat: 'PNG (transparent)',
        status: 'SUCCESS',
      };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `[LocalRembgFilter] Lỗi khi gọi Python Worker: ${err.message}`,
      );
      throw err;
    }

    return context;
  }
}

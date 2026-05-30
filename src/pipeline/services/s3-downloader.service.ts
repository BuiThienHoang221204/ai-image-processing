import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

@Injectable()
export class S3DownloaderService {
  private readonly logger = new Logger(S3DownloaderService.name);

  /**
   * Tải ảnh từ URL S3 về đĩa cứng local để AI có thể đọc file
   */
  async download(url: string): Promise<string> {
    if (!url || !url.startsWith('http')) {
      throw new HttpException('URL S3 không hợp lệ.', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`[S3Downloader] Đang tải ảnh từ S3 URL: ${url}`);

    try {
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
      });

      const tempDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Lấy đuôi mở rộng từ URL, default là .jpg
      const urlExt = path.extname(new URL(url).pathname);
      const ext = urlExt || '.jpg';

      const fileName = `s3_download_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
      const localFilePath = path.join(tempDir, fileName);

      const writer = fs.createWriteStream(localFilePath);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          this.logger.log(`[S3Downloader] Đã tải xong: ${localFilePath}`);
          resolve(localFilePath);
        });
        writer.on('error', (err) => {
          this.logger.error(`[S3Downloader] Lỗi ghi file: ${err.message}`);
          reject(
            new HttpException(
              'Lỗi khi lưu file từ S3.',
              HttpStatus.INTERNAL_SERVER_ERROR,
            ),
          );
        });
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[S3Downloader] Lỗi tải từ S3: ${msg}`);
      throw new HttpException(
        'Không thể tải file hình ảnh từ link S3. Vui lòng kiểm tra lại link.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucketName: string | undefined;
  private readonly region: string | undefined;

  constructor() {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    this.region = process.env.AWS_REGION || 'ap-southeast-1';
    this.bucketName = process.env.AWS_S3_BUCKET_NAME;

    if (accessKeyId && secretAccessKey && this.bucketName) {
      this.logger.log(
        `[StorageService] Cấu hình S3 hợp lệ. Kích hoạt bộ lưu trữ đám mây AWS S3 (Bucket: ${this.bucketName})`,
      );
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      this.logger.warn(
        '[StorageService] Thiếu cấu hình AWS S3. Tự động kích hoạt Local Fallback (Lưu trữ cục bộ trên EC2/PC).',
      );
    }
  }

  /**
   * Đẩy file từ đĩa cứng cục bộ lên S3 (hoặc trả về URL cục bộ nếu không cấu hình S3)
   * @param localPath Đường dẫn file trên ổ cứng cục bộ
   * @param s3Folder Thư mục phân loại trên S3 (ví dụ: 'raw', 'optimized')
   */
  async uploadFile(localPath: string, s3Folder: string): Promise<string> {
    if (!fs.existsSync(localPath)) {
      throw new Error(
        `[StorageService] File nguồn không tồn tại: ${localPath}`,
      );
    }

    const filename = path.basename(localPath);

    // 1. Chế độ AWS S3 (nếu có cấu hình)
    if (this.s3Client && this.bucketName) {
      try {
        const fileBuffer = fs.readFileSync(localPath);
        const ext = path.extname(localPath).toLowerCase();
        let contentType = 'application/octet-stream';

        if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.webp') contentType = 'image/webp';

        const s3Key = `${s3Folder}/${filename}`;

        this.logger.log(
          `[StorageService] Đang upload file lên S3: s3://${this.bucketName}/${s3Key}`,
        );

        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: contentType,
          }),
        );

        const s3Url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${s3Key}`;
        this.logger.log(`[StorageService] Upload S3 thành công! URL: ${s3Url}`);
        return s3Url;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `[StorageService] Lỗi khi upload lên S3: ${err.message}. Tự động fallback về Local.`,
        );
      }
    }

    // 2. Chế độ Local Fallback
    this.logger.log(
      `[StorageService] Phục vụ file cục bộ: /public/temp/${filename}`,
    );

    // Trả về relative URL tĩnh
    if (localPath.includes('uploads')) {
      return `/public/uploads/${filename}`;
    }
    return `/public/temp/${filename}`;
  }

  /**
   * Xóa sạch các file tạm cục bộ trên đĩa cứng EC2
   * @param localPaths Mảng các đường dẫn file cần dọn dẹp
   */
  async cleanLocalFiles(localPaths: string[]): Promise<void> {
    // Chỉ thực hiện dọn dẹp nếu đang kích hoạt chế độ S3 (để giải phóng ổ cứng EC2)
    // Nếu đang chạy offline Local Fallback thì giữ lại file để NestJS phục vụ qua static route
    if (!this.s3Client || !this.bucketName) {
      this.logger.log(
        '[StorageService] Đang chạy chế độ Local Fallback, giữ lại file trên ổ cứng để phục vụ client.',
      );
      return;
    }

    this.logger.log('[StorageService] Bắt đầu dọn dẹp đĩa cứng cục bộ EC2...');

    for (const filePath of localPaths) {
      if (!filePath) continue;

      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
          this.logger.log(
            `[StorageService] Đã xóa file tạm thành công: ${filePath}`,
          );
        }
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `[StorageService] Không thể xóa file tạm ${filePath}: ${err.message}`,
        );
      }
    }
  }
}

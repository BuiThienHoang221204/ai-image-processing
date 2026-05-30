import {
  Controller,
  Post,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RemoveObjectDto } from './dto/remove-object.dto';
import { ProductEnhanceDto } from './dto/product-enhance.dto';
import { PipelineProcessor } from './pipeline.processor';
import { PipelineContext } from './pipeline.context';
import { OpenRouterDetectFilter } from './filters/openrouter-detect.filter';
import { LocalRembgFilter } from './filters/local-rembg.filter';
import { LocalSharpFilter } from './filters/local-sharp.filter';
import { LocalInpaintFilter } from './filters/local-inpaint.filter';
import { IFilter } from './interfaces/filter.interface';
import { StorageService } from './services/storage.service';
import { S3DownloaderService } from './services/s3-downloader.service';

@ApiTags('AI Image Processing Pipeline')
@Controller('pipeline')
export class PipelineController {
  private readonly logger = new Logger(PipelineController.name);

  constructor(
    private readonly processor: PipelineProcessor,
    private readonly openRouterDetectFilter: OpenRouterDetectFilter,
    private readonly localInpaintFilter: LocalInpaintFilter,
    private readonly localRembgFilter: LocalRembgFilter,
    private readonly localSharpFilter: LocalSharpFilter,
    private readonly storageService: StorageService,
    private readonly s3Downloader: S3DownloaderService,
  ) {}

  @Post('remove-object')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Pipeline 1: Xóa đối tượng khỏi ảnh bằng AI định vị và inpainting local (OpenCV Telea)',
  })
  @ApiResponse({ status: 200, description: 'Xử lý thành công' })
  async removeObject(@Body() body: RemoveObjectDto) {
    if (!body.imageUrl) {
      throw new BadRequestException('Vui lòng cung cấp imageUrl từ S3.');
    }

    this.logger.log(
      `[POST /pipeline/remove-object] Tiếp nhận URL: ${body.imageUrl}`,
    );

    // Tải ảnh từ S3 về local
    let localImagePath: string;
    try {
      localImagePath = await this.s3Downloader.download(body.imageUrl);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Không thể tải ảnh từ URL';
      throw new BadRequestException(msg);
    }

    const optionsStr = body.options;
    const promptStr = body.prompt ?? '';

    let extraOptions: Record<string, unknown> = {};
    if (optionsStr) {
      try {
        extraOptions = JSON.parse(optionsStr) as Record<string, unknown>;
      } catch {
        throw new BadRequestException(
          'Trường options phải ở định dạng JSON string hợp lệ.',
        );
      }
    }

    const context = new PipelineContext(
      localImagePath,
      promptStr,
      extraOptions,
    );

    // Pipeline 1: Detect Object (Gemini) -> Local Inpaint/Remove (Python OpenCV) -> Enhance (Sharp)
    const filterChain = [
      this.openRouterDetectFilter,
      this.localInpaintFilter,
      this.localSharpFilter,
    ] as unknown as IFilter[];

    try {
      const resultContext = await this.processor.run(context, filterChain);

      // Đăng ký file raw upload vào danh sách file tạm để tự động dọn dẹp
      resultContext.tempFiles.push(localImagePath);

      // Đẩy ảnh thành phẩm lên AWS S3 (hoặc trả về local path nếu dùng Fallback)
      const finalImageUrl = await this.storageService.uploadFile(
        resultContext.currentImageUrl,
        'optimized',
      );

      // Dọn dẹp toàn bộ file tạm cục bộ trên EC2 (chỉ thực thi nếu S3 đang chạy)
      await this.storageService.cleanLocalFiles(resultContext.tempFiles);

      return {
        success: true,
        imageUrl: finalImageUrl,
        processingTime: `${resultContext.getElapsedTime()}ms`,
        steps: resultContext.steps,
        metadata: resultContext.metadata,
      };
    } catch (error: unknown) {
      // Đảm bảo dọn dẹp file tạm kể cả khi gặp lỗi
      try {
        await this.storageService.cleanLocalFiles([
          localImagePath,
          context.currentImageUrl,
          ...context.tempFiles,
        ]);
      } catch (cleanupError: unknown) {
        const msg =
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError);
        this.logger.debug(`Không thể dọn dẹp sớm file tạm: ${msg}`);
      }

      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Lỗi thực thi Pipeline 1: ${err.message}`);
      throw new BadRequestException(
        `Pipeline execution failed: ${err.message}`,
      );
    }
  }

  @Post('product-enhance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Pipeline 2: Tối ưu hóa ảnh e-commerce (tách nền AI local, crop, sharpen, add background)',
  })
  @ApiResponse({ status: 200, description: 'Xử lý thành công' })
  async productEnhance(@Body() body: ProductEnhanceDto) {
    if (!body.imageUrl) {
      throw new BadRequestException('Vui lòng cung cấp imageUrl từ S3.');
    }

    this.logger.log(
      `[POST /pipeline/product-enhance] Tiếp nhận URL S3: ${body.imageUrl}`,
    );

    // Tải ảnh từ S3 về local
    let localImagePath: string;
    try {
      localImagePath = await this.s3Downloader.download(body.imageUrl);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Không thể tải ảnh từ URL';
      throw new BadRequestException(msg);
    }

    const optionsStr = body.options;
    const backgroundColorStr = body.backgroundColor ?? 'white';

    let extraOptions: Record<string, unknown> = {};
    if (optionsStr) {
      try {
        extraOptions = JSON.parse(optionsStr) as Record<string, unknown>;
      } catch {
        throw new BadRequestException(
          'Trường options phải ở định dạng JSON string hợp lệ.',
        );
      }
    }

    extraOptions['backgroundColor'] =
      backgroundColorStr || extraOptions['backgroundColor'] || 'white';
    if (extraOptions['crop'] === undefined) extraOptions['crop'] = true;
    if (extraOptions['sharpen'] === undefined) extraOptions['sharpen'] = true;

    const context = new PipelineContext(
      localImagePath,
      undefined,
      extraOptions,
    );

    // Pipeline 2: LocalRembg (Python AI U2Net) -> Sharp (Crop/Sharpen/Background)
    const filterChain = [
      this.localRembgFilter,
      this.localSharpFilter,
    ] as unknown as IFilter[];

    try {
      const resultContext = await this.processor.run(context, filterChain);

      // Đăng ký file raw upload vào danh sách file tạm để tự động dọn dẹp
      resultContext.tempFiles.push(localImagePath);

      // Đẩy ảnh thành phẩm lên AWS S3 (hoặc trả về local path nếu dùng Fallback)
      const finalImageUrl = await this.storageService.uploadFile(
        resultContext.currentImageUrl,
        'optimized',
      );

      // Dọn dẹp toàn bộ file tạm cục bộ trên EC2 (chỉ thực thi nếu S3 đang chạy)
      await this.storageService.cleanLocalFiles(resultContext.tempFiles);

      return {
        success: true,
        imageUrl: finalImageUrl,
        processingTime: `${resultContext.getElapsedTime()}ms`,
        steps: resultContext.steps,
        metadata: resultContext.metadata,
      };
    } catch (error: unknown) {
      // Đảm bảo dọn dẹp file tạm kể cả khi gặp lỗi
      try {
        await this.storageService.cleanLocalFiles([
          localImagePath,
          context.currentImageUrl,
          ...context.tempFiles,
        ]);
      } catch (cleanupError: unknown) {
        const msg =
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError);
        this.logger.debug(`Không thể dọn dẹp sớm file tạm: ${msg}`);
      }

      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Lỗi thực thi Pipeline 2: ${err.message}`);
      throw new BadRequestException(
        `Pipeline execution failed: ${err.message}`,
      );
    }
  }
}

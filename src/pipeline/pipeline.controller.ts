import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { RemoveObjectDto } from './dto/remove-object.dto';
import { ProductEnhanceDto } from './dto/product-enhance.dto';
import { PipelineProcessor } from './pipeline.processor';
import { PipelineContext } from './pipeline.context';
import { OpenRouterDetectFilter } from './filters/openrouter-detect.filter';
import { LocalRembgFilter } from './filters/local-rembg.filter';
import { LocalSharpFilter } from './filters/local-sharp.filter';
import { LocalInpaintFilter } from './filters/local-inpaint.filter';
import { IFilter } from './interfaces/filter.interface';

// Cấu hình Multer lưu file tạm thời
const storageOptions = diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `upload_${uniqueSuffix}${ext}`);
  },
});

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
  ) {}

  @Post('remove-object')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image', { storage: storageOptions }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Pipeline 1: Xóa đối tượng khỏi ảnh bằng AI định vị và inpainting local (OpenCV Telea)',
  })
  @ApiResponse({ status: 200, description: 'Xử lý thành công' })
  async removeObject(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: RemoveObjectDto,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Vui lòng upload một hình ảnh hợp lệ (image).',
      );
    }

    this.logger.log(
      `[POST /pipeline/remove-object] Tiếp nhận file: ${file.filename}`,
    );

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

    const context = new PipelineContext(file.path, promptStr, extraOptions);

    // Pipeline 1: Detect Object (Gemini) -> Local Inpaint/Remove (Python OpenCV) -> Enhance (Sharp)
    const filterChain = [
      this.openRouterDetectFilter,
      this.localInpaintFilter,
      this.localSharpFilter,
    ] as unknown as IFilter[];

    try {
      const resultContext = await this.processor.run(context, filterChain);
      const relativePath = path
        .relative(process.cwd(), resultContext.currentImageUrl)
        .replace(/\\/g, '/');
      return {
        success: true,
        imageUrl: `/${relativePath}`,
        processingTime: `${resultContext.getElapsedTime()}ms`,
        steps: resultContext.steps,
        metadata: resultContext.metadata,
      };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Lỗi thực thi Pipeline 1: ${err.message}`);
      throw new BadRequestException(
        `Pipeline execution failed: ${err.message}`,
      );
    }
  }

  @Post('product-enhance')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image', { storage: storageOptions }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Pipeline 2: Tối ưu hóa ảnh e-commerce (tách nền AI local, crop, sharpen, add background)',
  })
  @ApiResponse({ status: 200, description: 'Xử lý thành công' })
  async productEnhance(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ProductEnhanceDto,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Vui lòng upload một hình ảnh hợp lệ (image).',
      );
    }

    this.logger.log(
      `[POST /pipeline/product-enhance] Tiếp nhận file: ${file.filename}`,
    );

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

    const context = new PipelineContext(file.path, undefined, extraOptions);

    // Pipeline 2: LocalRembg (Python AI U2Net) -> Sharp (Crop/Sharpen/Background)
    const filterChain = [
      this.localRembgFilter,
      this.localSharpFilter,
    ] as unknown as IFilter[];

    try {
      const resultContext = await this.processor.run(context, filterChain);
      const relativePath = path
        .relative(process.cwd(), resultContext.currentImageUrl)
        .replace(/\\/g, '/');
      return {
        success: true,
        imageUrl: `/${relativePath}`,
        processingTime: `${resultContext.getElapsedTime()}ms`,
        steps: resultContext.steps,
        metadata: resultContext.metadata,
      };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Lỗi thực thi Pipeline 2: ${err.message}`);
      throw new BadRequestException(
        `Pipeline execution failed: ${err.message}`,
      );
    }
  }
}

import { IFilter } from '../interfaces/filter.interface';
import { PipelineContext } from '../pipeline.context';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';

@Injectable()
export class OpenRouterDetectFilter implements IFilter {
  readonly name = 'OpenRouterDetectFilter';
  private readonly logger = new Logger(OpenRouterDetectFilter.name);

  async execute(context: PipelineContext): Promise<PipelineContext> {
    if (!context.prompt) {
      this.logger.warn(
        `[OpenRouterDetectFilter] Không có prompt yêu cầu, bỏ qua.`,
      );
      return context;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';

    if (!apiKey) {
      this.logger.warn(
        `[OpenRouterDetectFilter] Không tìm thấy OPENROUTER_API_KEY trong .env. Kích hoạt chế độ MOCK DETECT.`,
      );
      this.activateFallback(context, 'MOCK_DEMO');
      return context;
    }

    this.logger.log(
      `[OpenRouterDetectFilter] Đang gọi OpenRouter định vị đối tượng: "${context.prompt}"`,
    );
    this.logger.log(
      `[OpenRouterDetectFilter] Gửi yêu cầu tới OpenRouter model: ${model}`,
    );

    try {
      const inputPath = context.currentImageUrl;
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Không tìm thấy file nguồn tại: ${inputPath}`);
      }

      // 1. Đọc ảnh và chuyển sang base64
      const imageBuffer = fs.readFileSync(inputPath);
      const base64Image = imageBuffer.toString('base64');
      const imageUrlData = `data:image/jpeg;base64,${base64Image}`;

      // 2. Gọi OpenRouter API (Gemini 2.0 Flash / GPT-4o-Mini)
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `You are an expert AI image editor. The user wants to remove/edit an object from the provided image.
Here is the user's editing instruction/prompt: "${context.prompt}"

Your task:
1. Analyze the user's instruction and identify:
   - What specific object(s), area(s), or element(s) they want to REMOVE or DELETE (the target).
   - What elements they explicitly want to KEEP or PRESERVE unchanged.
2. Locate the REMOVE target object in the image.
3. Return the exact Bounding Box of the target object to be deleted.
   - The coordinates must be a JSON array [ymin, xmin, ymax, xmax] normalized in the range 0 to 1000 (0 represents top/left, 1000 represents bottom/right).
   - The box must cover the ENTIRE target object to be deleted (including its shadows, trunk, branches, leaves, or any associated parts).
   - Do NOT include the area of elements that the user wants to KEEP.
   - Make sure the bounding box covers the target object fully to avoid leaving any floating cutoffs or artifacts.

Return ONLY the JSON array [ymin, xmin, ymax, xmax] in plain text or markdown block, with absolutely no other text, comments, or explanations.
Example output format: [100, 200, 900, 800]`,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrlData,
                  },
                },
              ],
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 45000, // 45 giây timeout cho AI Vision
        },
      );

      const resData = response.data as {
        model?: string;
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };

      const content = resData.choices?.[0]?.message?.content || '';
      this.logger.log(
        `[OpenRouterDetectFilter] OpenRouter phản hồi: ${content}`,
      );

      // 3. Trích xuất JSON Bounding Box
      const matchedJson = content.match(
        /\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\]/,
      );
      let boundingBox: [number, number, number, number] | null = null;
      if (matchedJson) {
        boundingBox = JSON.parse(matchedJson[0]) as [
          number,
          number,
          number,
          number,
        ];
      }

      if (!boundingBox || boundingBox.length !== 4) {
        throw new Error(
          `Không thể parse bounding box từ phản hồi của AI: ${content}`,
        );
      }

      // Lưu kết quả vào context metadata để filter tiếp theo (Replicate Inpaint) sử dụng
      context.metadata[this.name] = {
        targetPrompt: context.prompt,
        detectedBox: boundingBox,
        rawModelResponse: content,
        status: 'SUCCESS',
        aiEngine: resData.model || model,
      };

      this.logger.log(
        `[OpenRouterDetectFilter] Đã định vị thành công đối tượng: ${JSON.stringify(boundingBox)}`,
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      const responseData = (error as { response?: { data: unknown } }).response
        ?.data;

      this.logger.error(
        `[OpenRouterDetectFilter] Lỗi gọi OpenRouter API: ${
          responseData ? JSON.stringify(responseData) : err.message
        }`,
      );

      this.logger.warn(
        `[OpenRouterDetectFilter] Đang kích hoạt FALLBACK MOCK BOX...`,
      );
      this.activateFallback(context, 'FALLBACK_MOCK');
    }

    return context;
  }

  private activateFallback(context: PipelineContext, status: string): void {
    const promptLower = (context.prompt || '').toLowerCase();
    let defaultBox: [number, number, number, number] = [150, 200, 800, 900]; // Mặc định trung tâm

    if (
      promptLower.includes('right') ||
      promptLower.includes('phải') ||
      promptLower.includes(' letter c') ||
      promptLower.includes(' chữ c') ||
      promptLower.includes('curved c') ||
      promptLower.includes('shape c')
    ) {
      // Nếu prompt đề cập đến bên phải hoặc chữ C, khoanh vùng nửa bên phải logo
      defaultBox = [150, 450, 850, 900];
      this.logger.log(
        `[OpenRouterDetectFilter] Kích hoạt Smart Fallback LỆCH PHẢI (Chữ C / Right side): ${JSON.stringify(defaultBox)}`,
      );
    } else if (
      promptLower.includes('left') ||
      promptLower.includes('trái') ||
      promptLower.includes(' letter x') ||
      promptLower.includes(' chữ x')
    ) {
      // Nếu prompt đề cập đến bên trái hoặc chữ X, khoanh vùng nửa bên trái logo
      defaultBox = [150, 100, 850, 550];
      this.logger.log(
        `[OpenRouterDetectFilter] Kích hoạt Smart Fallback LỆCH TRÁI (Chữ X / Left side): ${JSON.stringify(defaultBox)}`,
      );
    } else if (
      promptLower.includes('top') ||
      promptLower.includes('above') ||
      promptLower.includes('trên')
    ) {
      // Lệch trên
      defaultBox = [50, 150, 500, 850];
      this.logger.log(
        `[OpenRouterDetectFilter] Kích hoạt Smart Fallback LỆCH TRÊN (Top / Above): ${JSON.stringify(defaultBox)}`,
      );
    } else if (
      promptLower.includes('bottom') ||
      promptLower.includes('below') ||
      promptLower.includes('dưới')
    ) {
      // Lệch dưới
      defaultBox = [500, 150, 950, 850];
      this.logger.log(
        `[OpenRouterDetectFilter] Kích hoạt Smart Fallback LỆCH DƯỚI (Bottom / Below): ${JSON.stringify(defaultBox)}`,
      );
    } else {
      this.logger.log(
        `[OpenRouterDetectFilter] Kích hoạt Smart Fallback TRUNG TÂM (Center): ${JSON.stringify(defaultBox)}`,
      );
    }

    context.metadata[this.name] = {
      targetPrompt: context.prompt,
      detectedBox: defaultBox,
      status: status,
      aiEngine: 'Mock-Gemini-2.0-Flash-Smart-Fallback',
    };
  }
}

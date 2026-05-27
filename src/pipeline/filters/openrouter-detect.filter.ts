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
                  text: `Bạn là trợ lý AI xử lý ảnh. Hãy định vị vật thể "${context.prompt}" trong bức ảnh này.
Hãy trả về chính xác một mảng tọa độ Bounding Box dưới dạng JSON [ymin, xmin, ymax, xmax] trong khoảng tỉ lệ từ 0 đến 1000 đại diện cho góc trên bên trái đến góc dưới bên phải.
Ví dụ: [150, 200, 800, 900]. Chỉ trả về duy nhất mảng JSON đó trong thẻ markdown hoặc văn bản thuần, không thêm lời giải thích nào khác.`,
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
        `[OpenRouterDetectFilter] Đang kích hoạt FALLBACK MOCK BOX: [150, 200, 800, 900]`,
      );
      this.activateFallback(context, 'FALLBACK_MOCK');
    }

    return context;
  }

  private activateFallback(context: PipelineContext, status: string): void {
    context.metadata[this.name] = {
      targetPrompt: context.prompt,
      detectedBox: [150, 200, 800, 900], // Bounding box mặc định để xóa đối tượng trung tâm
      status: status,
      aiEngine: 'Mock-Gemini-2.0-Flash',
    };
  }
}

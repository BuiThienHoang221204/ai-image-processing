import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Kích hoạt Validation Pipes cho kiểm tra dữ liệu đầu vào DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Cấu hình Swagger API Docs
  const config = new DocumentBuilder()
    .setTitle('AI Image Processing Pipeline Service')
    .setDescription(
      'Microservice xử lý hình ảnh dựa trên AI theo kiến trúc Pipeline Architecture',
    )
    .setVersion('1.0')
    .addTag('Image Processing Pipeline')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Phục vụ file tĩnh trong thư mục public (để truy cập ảnh tải lên và ảnh đã xử lý)
  app.use('/public', express.static(path.join(process.cwd(), 'public')));

  // Kích hoạt CORS cho phép các service khác hoặc frontend gọi
  app.enableCors();

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/docs`);
}
void bootstrap();

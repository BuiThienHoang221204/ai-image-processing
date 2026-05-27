# AI Image Processing Pipeline Service

Microservice xử lý hình ảnh thông minh độc lập dựa trên kiến trúc **Pipeline & Filter Architecture** kết hợp mô hình **Local Microservices (NestJS + Python FastAPI Worker + Sharp C++ Node.js Engine)** giúp xử lý ảnh 100% offline, an toàn và hoàn toàn miễn phí trọn đời.

Dịch vụ cung cấp các REST API cho phép các service điều phối (**Orchestration Services**) gọi thực thi xử lý hình ảnh phức tạp một cách tối ưu, ổn định và cực kỳ tiết kiệm chi phí.

---

## 🚀 ĐẶC ĐIỂM NỔI BẬT

1. **Pipeline & Filter Architecture**: Thiết kế mã nguồn modular, mỗi bước xử lý ảnh là một Filter độc lập (`IFilter`), dễ dàng bảo trì, hoán đổi vị trí hoặc thêm bộ lọc mới mà không cần can thiệp vào code lõi.
2. **Local AI & Hybrid Engine**:
   * **OpenRouter** (Vision Models: Gemini 2.0 Flash) định vị vật thể qua prompt văn bản, trả về tọa độ Bounding Box JSON. Có chế độ **Fallback Mock Box** tự động nếu chạy offline không có Internet.
   * **Local Python Worker (FastAPI + rembg U2Net + OpenCV Telea)** xử lý tách nền AI và Inpainting xóa vật thể 100% cục bộ, miễn phí hoàn toàn, không phụ thuộc Cloud API trả phí (Replicate, Fal.ai).
   * **Sharp C++** (Local Engine) xử lý hình ảnh thô siêu tốc trực tiếp trên RAM máy chủ (crop, sharpen, contrast, background, resize).
3. **Stateless & Orchestration-friendly**: Dịch vụ stateless hoàn toàn, mỗi request chứa đầy đủ context và trả về chi tiết log thực thi từng bước xử lý (`steps` log).
4. **Production-Ready**: Cấu hình sẵn Docker, Swagger Docs và tài liệu kiểm thử chi tiết.

---

## 📂 CẤU TRÚC THƯ MỤC DỰ ÁN

```text
ai-image-processing/
├── python_worker/            # Máy chủ Python AI xử lý ảnh offline (FastAPI)
│   ├── main.py               # API xử lý tách nền rembg U2Net & inpaint OpenCV
│   ├── requirements.txt      # Danh sách thư viện Python cần thiết
│   └── start.bat             # Script tự động kiểm tra Python & khởi chạy worker
├── public/                   # Thư mục lưu trữ ảnh tĩnh (uploads và temp)
├── src/
│   ├── common/               # Bộ lọc lỗi toàn cục, Interceptor
│   ├── pipeline/             # Module Core xử lý Pipeline
│   │   ├── dto/              # Định nghĩa Request Body (RemoveObject, ProductEnhance)
│   │   ├── filters/          # Các bộ lọc xử lý độc lập (Concrete Filters)
│   │   │   ├── local-sharp.filter.ts       # Xử lý Sharp C++ cục bộ
│   │   │   ├── openrouter-detect.filter.ts  # Gọi OpenRouter định vị vật thể
│   │   │   ├── local-inpaint.filter.ts      # Gọi Python Worker để inpaint xóa vật thể
│   │   │   └── local-rembg.filter.ts        # Gọi Python Worker để tách nền AI
│   │   ├── interfaces/       # Các interface định nghĩa (IFilter)
│   │   ├── pipeline.context.ts             # Lưu trữ context xử lý ảnh
│   │   ├── pipeline.controller.ts          # REST API endpoints
│   │   ├── pipeline.module.ts              # Đăng ký Controller & Providers
│   │   └── pipeline.processor.ts           # Bộ điều phối Pipeline
│   ├── app.module.ts
│   └── main.ts               # Khởi chạy NestJS & Cấu hình Swagger
├── Dockerfile                # Đóng gói microservice production
├── package.json
└── tsconfig.json
```

---

## 🛠️ HƯỚNG DẪN CÀI ĐẶT & CHẠY LOCAL

### 1. Khởi chạy Python AI Worker (Tách nền & Inpaint)
* Yêu cầu máy đã cài **Python 3.10+** (tích vào ô "Add Python to PATH" lúc cài).
* Truy cập thư mục `python_worker/` và chạy file **`start.bat`**. 
* Script sẽ tự động tạo môi trường ảo `(venv)`, cài đặt đầy đủ các thư viện AI (`fastapi`, `uvicorn`, `rembg`, `opencv-python`) và kích hoạt worker tại cổng **`8000`**.

### 2. Khởi chạy NestJS Gateway Backend
* Tạo file `.env` tại thư mục gốc của NestJS:
```env
PORT=3001
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=google/gemini-2.0-flash-001
PYTHON_BG_REMOVAL_URL=http://localhost:8000/remove-bg
```
* Tiến hành khởi chạy NestJS:
```bash
# Cài đặt thư viện
npm install

# Khởi chạy chế độ Development
npm run start:dev
```

Sau khi chạy thành công, truy cập các địa chỉ sau:
* **Swagger API Docs**: [http://localhost:3001/docs](http://localhost:3001/docs)
* **REST API Public URL**: [http://localhost:3001](http://localhost:3001)

---

## 📝 LUỒNG XỬ LÝ PIPELINES CHÍNH

### 1. Xóa đối tượng khỏi ảnh (Pipeline 1)
* **Endpoint**: `POST /pipeline/remove-object` (Multipart Form-Data)
* **Luồng**:
  1. `OpenRouterDetectFilter`: Gọi Vision LLM định vị vật thể cần xóa dựa trên `prompt` của người dùng, trả về bounding box.
  2. `LocalInpaintFilter`: Dùng Sharp vẽ mask, gửi cả ảnh gốc + mask sang Python Worker (`/inpaint`) để thực hiện xóa vật thể local bằng OpenCV Telea siêu tốc.
  3. `LocalSharpFilter`: Cắt crop, chỉnh lại chất lượng ảnh và lưu sản phẩm.

### 2. Tách nền & Tối ưu hóa ảnh E-commerce (Pipeline 2)
* **Endpoint**: `POST /pipeline/product-enhance` (Multipart Form-Data)
* **Luồng**:
  1. `LocalRembgFilter`: Gửi ảnh gốc sang Python Worker (`/remove-bg`) để tách nền bằng AI model U2Net, trả về ảnh PNG trong suốt.
  2. `LocalSharpFilter`: Tự động crop sát sản phẩm (auto-crop), tăng độ sắc nét (sharpen), chỉnh lại độ sáng và chèn màu nền mới (`backgroundColor`) theo yêu cầu.

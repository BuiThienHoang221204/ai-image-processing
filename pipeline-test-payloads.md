# 🧪 MẪU KIỂM THỬ 2 PIPELINE XỬ LÝ ẢNH
## AI Image Processing Pipeline Service

Tài liệu này cung cấp các mẫu dữ liệu đầu vào (Payloads), các chuỗi cấu hình JSON cho trường `options` và lệnh cURL tương ứng được tối ưu cho **Cổng 3001** và tài liệu Swagger tại **`http://localhost:3001/docs`**.

---

## 🌀 PIPELINE 1: REMOVE OBJECT FROM IMAGE (Xóa Vật Thể)
* **Endpoint**: `POST http://localhost:3001/pipeline/remove-object`
* **Content-Type**: `multipart/form-data`

### 📋 Tham số yêu cầu:
1. `image`: File ảnh gốc cần xóa vật thể (định dạng `.png`, `.jpg`, `.webp`).
2. `prompt`: Đối tượng bạn muốn xóa (ví dụ: `person`, `text`, `logo`, `car`, `chair`).
3. `options`: Chuỗi JSON cấu hình các tùy chọn nâng cao sau khi xóa.

### 💡 Các mẫu cấu hình `options` cho Pipeline 1:

#### Mẫu 1.1: Xóa vật thể + Tăng cường độ sắc nét và ánh sáng (Khuyên Dùng)
* **Raw JSON**:
  ```json
  {
    "brightness": 1.1,
    "contrast": 1.05,
    "sharpen": true,
    "crop": false
  }
  ```
* **Stringified (Dán vào Swagger)**:
  ```text
  {"brightness":1.1,"contrast":1.05,"sharpen":true,"crop":false}
  ```

#### Mẫu 1.2: Xóa vật thể + Tự động cắt viền trống thừa (Trim Crop)
* **Raw JSON**:
  ```json
  {
    "brightness": 1.0,
    "sharpen": false,
    "crop": true
  }
  ```
* **Stringified (Dán vào Swagger)**:
  ```text
  {"brightness":1.0,"sharpen":false,"crop":true}
  ```

### 💻 Lệnh cURL chạy thử Pipeline 1:
```bash
curl -X POST "http://localhost:3001/pipeline/remove-object" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "image=@D:/images/sample-photo.jpg" \
  -F "prompt=person" \
  -F "options={\"brightness\":1.1,\"contrast\":1.05,\"sharpen\":true,\"crop\":false}"
```

---

## 🛍️ PIPELINE 2: PRODUCT ENHANCE (Tối Ưu Ảnh E-Commerce)
* **Endpoint**: `POST http://localhost:3001/pipeline/product-enhance`
* **Content-Type**: `multipart/form-data`

### 📋 Tham số yêu cầu:
1. `image`: File ảnh sản phẩm gốc (định dạng `.png`, `.jpg`, `.webp`).
2. `backgroundColor`: Màu nền muốn đổi (ví dụ: `white`, `black`, `transparent`, hoặc mã Hex `#F3F4F6`).
3. `options`: Chuỗi JSON cấu hình các bộ lọc Sharp (độ sắc nét, thay đổi kích thước, crop).

### 💡 Các mẫu cấu hình `options` cho Pipeline 2:

#### Mẫu 2.1: Đổi sang nền trắng chuẩn E-commerce + Tự động cắt rìa thừa + Làm nét sản phẩm
* **Tham số `backgroundColor`**: `white`
* **Raw JSON**:
  ```json
  {
    "crop": true,
    "sharpen": true,
    "brightness": 1.05,
    "contrast": 1.0,
    "resizeWidth": 800,
    "resizeHeight": 800
  }
  ```
* **Stringified (Dán vào Swagger)**:
  ```text
  {"crop":true,"sharpen":true,"brightness":1.05,"contrast":1.0,"resizeWidth":800,"resizeHeight":800}
  ```

#### Mẫu 2.2: Đổi sang nền trong suốt + Làm nổi bật chi tiết sản phẩm + Đóng khung 1000x1000
* **Tham số `backgroundColor`**: `transparent`
* **Raw JSON**:
  ```json
  {
    "crop": true,
    "sharpen": true,
    "brightness": 1.1,
    "contrast": 1.05,
    "resizeWidth": 1000,
    "resizeHeight": 1000
  }
  ```
* **Stringified (Dán vào Swagger)**:
  ```text
  {"crop":true,"sharpen":true,"brightness":1.1,"contrast":1.05,"resizeWidth":1000,"resizeHeight":1000}
  ```

#### Mẫu 2.3: Đổi sang màu nền Hex thương hiệu cao cấp (Màu Xám Nhạt Cao Cấp `#F5F5F7`)
* **Tham số `backgroundColor`**: `#F5F5F7`
* **Raw JSON**:
  ```json
  {
    "crop": true,
    "sharpen": true
  }
  ```
* **Stringified (Dán vào Swagger)**:
  ```text
  {"crop":true,"sharpen":true}
  ```

### 💻 Lệnh cURL chạy thử Pipeline 2:
```bash
curl -X POST "http://localhost:3001/pipeline/product-enhance" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "image=@D:/images/product-raw.png" \
  -F "backgroundColor=#F5F5F7" \
  -F "options={\"crop\":true,\"sharpen\":true,\"brightness\":1.05,\"resizeWidth\":800,\"resizeHeight\":800}"
```

---

## 🛠️ HƯỚNG DẪN CẤU HÌNH TRÊN POSTMAN

Nếu bạn muốn sử dụng **Postman** thay cho Swagger:

1. **Khởi tạo Request**:
   * Phương thức: **`POST`**
   * Địa chỉ URL: `http://localhost:3001/pipeline/remove-object` hoặc `http://localhost:3001/pipeline/product-enhance`
2. **Cấu hình thẻ Headers**:
   * Thêm Header: `Accept` = `application/json`
   * *Không cần thêm Content-Type vì Postman sẽ tự động sinh khi chọn form-data.*
3. **Cấu hình thẻ Body**:
   * Chọn kiểu: **`form-data`**
   * Thêm các trường key-value tương ứng:
     * **`image`**: Chọn loại là **`File`**, sau đó chọn file ảnh từ máy tính của bạn.
     * **`prompt`**: Loại **`Text`**, điền đối tượng cần xóa (chỉ áp dụng cho `remove-object`).
     * **`backgroundColor`**: Loại **`Text`**, điền màu nền (chỉ áp dụng cho `product-enhance`).
     * **`options`**: Loại **`Text`**, sao chép một trong các chuỗi **Stringified JSON** ở phía trên dán vào.
4. **Nhấn Send** và chiêm ngưỡng kết quả JSON trả về!

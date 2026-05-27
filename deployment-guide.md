# HƯỚNG DẪN TRIỂN KHAI AWS EC2 & CẤU HÌNH CI/CD
## AI Image Processing Pipeline Service (100% Cục bộ & Miễn phí)

Tài liệu này hướng dẫn chi tiết từng bước thiết lập máy chủ ảo AWS EC2, đóng gói và khởi chạy đồng thời cả máy chủ NestJS Gateway Backend và Python AI Worker bằng Docker Compose, đồng thời thiết lập tối ưu hóa lưu trữ cache mô hình AI.

---

## 📌 PHẦN 1: THIẾT LẬP MÁY CHỦ AWS EC2

### 1. Lựa chọn cấu hình Instance
* **Cấu hình tối thiểu khuyến nghị**: **t3.medium** (2 vCPUs, 4GB RAM) hoặc **t3.large** để đảm bảo quá trình tải mô hình AI vào bộ nhớ CPU hoạt động nhanh chóng và thư viện Sharp C++ biên dịch mượt mà.
* **Hệ điều hành**: **Ubuntu Server 22.04 LTS (HVM), SSD Volume Type**.
* **Dung lượng ổ cứng**: Tối thiểu **30GB GP3 SSD** (để chứa các Docker layers, ảnh cache và các mô hình AI U2Net/LaMa).
* **Security Group (Cấu hình Tường lửa)**:
  * Cho phép **Port 22 (SSH)** để quản trị.
  * Cho phép **Port 3002 (HTTP)** để công khai API Gateway của NestJS (hoặc cấu hình Nginx Reverse Proxy chặn phía trước).
  * *Tùy chọn*: Cho phép **Port 8000 (HTTP)** nếu muốn kiểm tra/gọi trực tiếp Python Worker từ bên ngoài (khuyên dùng chặn cổng này và chỉ cho phép NestJS gọi nội bộ trong mạng Docker).

### 2. Cài đặt Docker & Docker Compose trên EC2
Kết nối SSH vào máy chủ EC2 của bạn và chạy loạt lệnh sau để cài đặt Docker Engine:

```bash
# Cập nhật hệ thống
sudo apt-get update -y
sudo apt-get upgrade -y

# Cài đặt các thư viện hỗ trợ
sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Thêm khóa GPG chính thức của Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Thiết lập repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Cài đặt Docker Engine & Docker Compose
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Cấu hình quyền chạy Docker không cần lệnh sudo
sudo usermod -aG docker $USER

# Kiểm tra phiên bản hoạt động
docker --version
docker compose version
```
*Lưu ý: Sau khi thêm user vào group `docker`, bạn hãy thoát SSH và đăng nhập lại để quyền thực thi không cần sudo có hiệu lực.*

---

## 🔑 PHẦN 2: CẤU HÌNH SSH KEY CHO GITHUB ACTIONS

Để GitHub Actions có thể kết nối vào máy chủ EC2 của bạn để triển khai (deploy) tự động:

1. **Sinh SSH Key mới trên máy tính của bạn (hoặc dùng Private Key `.pem` hiện tại của EC2)**.
2. **Thêm Public Key** tương ứng vào file `~/.ssh/authorized_keys` trên EC2 của bạn để cấp quyền truy cập.
3. **Cấu hình GitHub Secrets**:
   Truy cập kho chứa mã nguồn GitHub của bạn: **Settings > Secrets and variables > Actions > New repository secret** và cấu hình 3 biến bảo mật sau:
   
   | Tên Secret | Mô tả | Ví dụ |
   | :--- | :--- | :--- |
   | `EC2_HOST` | Địa chỉ IP Public hoặc Domain của server EC2 | `54.120.45.89` |
   | `EC2_USERNAME` | Tên đăng nhập mặc định của hệ điều hành | `ubuntu` |
   | `EC2_SSH_KEY` | Nội dung đầy đủ của file Private Key `.pem` (Bao gồm cả dòng BEGIN và END) | `-----BEGIN RSA PRIVATE KEY----- ... -----END RSA PRIVATE KEY-----` |

---

## ⚡ PHẦN 3: THIẾT LẬP THƯ MỤC DỰ ÁN TRÊN EC2 LẦN ĐẦU

Trước khi chạy CI/CD lần đầu, bạn cần tạo thư mục dự án và clone mã nguồn về EC2 để GitHub Actions chỉ việc truy cập và thực thi lệnh cập nhật:

```bash
# Di chuyển về thư mục home của ubuntu
cd /home/ubuntu

# Clone dự án từ GitHub của bạn
git clone https://github.com/YOUR_USERNAME/ai-image-processing.git

# Di chuyển vào dự án
cd ai-image-processing

# Tạo file .env chứa các API Keys bảo mật trên máy chủ EC2
cat <<EOT > .env
PORT=3002
NODE_ENV=production
OPENROUTER_API_KEY=your_actual_key_here
EOT
```

---

## 🚀 PHẦN 4: KHỞI CHẠY HỆ THỐNG BẰNG DOCKER COMPOSE

Quy trình khởi chạy hai container song song kết nối cực kỳ mượt mà:

```bash
# Khởi chạy hệ thống ở chế độ chạy ngầm
docker compose up -d --build
```

### 💡 Điểm tối ưu hóa kiến trúc hạ tầng vượt trội của hệ thống:
1. **Lưu trữ Cache Model AI thông minh**: Trong `docker-compose.yml`, hai volume vật lý đã được liên kết:
   * `torch-cache` lưu trữ các mô hình inpaint như `big-lama.pt`.
   * `u2net-cache` lưu trữ các mô hình tách nền như `u2net.onnx`.
   Nhờ đó, khi bạn khởi động lại, nâng cấp hoặc xây dựng lại container, máy chủ EC2 **hoàn toàn không phải tải lại các file AI model khổng lồ này từ Internet**, giúp giảm tải băng thông và phục hồi hệ thống ngay lập tức chỉ trong 1 giây!
2. **Cầu nối mạng nội bộ bảo mật**: NestJS giao tiếp với Python Worker thông qua mạng nội bộ Docker Bridge (`http://python-worker:8000`), không cần phơi bày API Python Worker ra Internet công cộng, đảm bảo an toàn tuyệt đối.

---

## ⚙️ PHẦN 5: HOẠT ĐỘNG CỦA PIPELINE CI/CD

Mỗi khi bạn thực hiện `git push` lên nhánh `main`, luồng CI/CD trong file `.github/workflows/ci-cd.yml` sẽ tự động thực hiện:

1. **Kiểm tra lỗi cú pháp (CI)**: Khởi tạo máy ảo chạy thử `npm run build` TypeScript để chắc chắn dự án không có lỗi biên dịch trước khi deploy.
2. **Triển khai tự động (CD)**: Truy cập SSH bảo mật bằng Private Key tới server EC2 của bạn và chạy chuỗi lệnh:
   ```bash
   cd /home/ubuntu/ai-image-processing
   git pull origin main
   docker compose down
   docker compose up -d --build
   docker system prune -f
   ```

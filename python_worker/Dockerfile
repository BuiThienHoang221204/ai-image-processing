FROM python:3.10-slim

WORKDIR /app

# Cài đặt các thư viện hệ thống cần thiết cho OpenCV hoạt động trên Linux
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements và cài đặt dependencies Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ mã nguồn python worker
COPY . .

# Mở cổng 8000 của FastAPI
EXPOSE 8000

# Thiết lập biến môi trường chạy thuần CPU và tắt log đệm
ENV PYTHONUNBUFFERED=1
ENV CUDA_VISIBLE_DEVICES=""

# Khởi chạy FastAPI app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

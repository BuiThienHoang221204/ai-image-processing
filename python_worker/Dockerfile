FROM python:3.10-slim

WORKDIR /app

# Cài thư viện hệ thống cho OpenCV / Pillow / AI Image Processing (Tối ưu hóa tránh treo và giảm size)
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip trước
RUN pip install --upgrade pip

# Copy requirements
COPY requirements.txt .

# Cài đặt trước PyTorch bản CPU-only siêu nhẹ (~170MB thay vì 2.6GB bản CUDA mặc định)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Cài các dependencies còn lại
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Force CPU mode
ENV PYTHONUNBUFFERED=1
ENV CUDA_VISIBLE_DEVICES=""
ENV PYTORCH_ENABLE_MPS_FALLBACK=1

# Start FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
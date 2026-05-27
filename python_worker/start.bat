@echo off
chcp 65001 > nul
echo ============================================
echo   AI Image Processing - Python Worker Setup
echo ============================================
echo.

REM Kiểm tra Python đã cài chưa
python --version > nul 2>&1
if errorlevel 1 (
    echo [LỖI] Python chưa được cài đặt trên máy!
    echo.
    echo Vui lòng tải và cài Python 3.10+ tại:
    echo   https://www.python.org/downloads/
    echo.
    echo Lưu ý: Tích vào ô "Add Python to PATH" khi cài!
    echo.
    pause
    exit /b 1
)

echo [OK] Python đã được cài:
python --version
echo.

echo [1/3] Đang cài đặt thư viện Python...
python -m pip install fastapi uvicorn rembg python-multipart Pillow --upgrade

if errorlevel 1 (
    echo [LỖI] Cài đặt thư viện thất bại!
    pause
    exit /b 1
)

echo.
echo [2/3] Cài đặt thành công!
echo.
echo [3/3] Đang khởi động Python AI Worker tại cổng 8000...
echo       (Lần đầu chạy sẽ tải model AI U2Net ~170MB, hãy chờ...)
echo.
echo Swagger Docs: http://localhost:8000/docs
echo Health Check: http://localhost:8000/health
echo.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

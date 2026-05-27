import os
os.environ["CUDA_VISIBLE_DEVICES"] = ""

# pyrefly: ignore [missing-import]
from fastapi import FastAPI, UploadFile, File, HTTPException
# pyrefly: ignore [missing-import]
from fastapi.responses import Response
import io
import logging
# pyrefly: ignore [missing-import]
import cv2
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
from PIL import Image

logger = logging.getLogger("rembg-worker")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="AI Image Processing Python Worker",
    description="Local background removal (rembg U2Net) and local object inpainting (LaMa AI / OpenCV) - 100% free",
    version="1.2.0"
)

# Tải model rembg một lần duy nhất khi server khởi động (tránh load mỗi request)
# pyrefly: ignore [missing-import]
from rembg import remove, new_session
REMBG_SESSION = None
SIMPLE_LAMA = None

@app.on_event("startup")
async def load_model():
    global REMBG_SESSION, SIMPLE_LAMA
    
    # 1. Tải Model tách nền U2Net
    logger.info("[rembg-worker] Đang tải AI model U2Net vào bộ nhớ...")
    try:
        REMBG_SESSION = new_session("u2net")
        logger.info("[rembg-worker] Model U2Net đã tải thành công!")
    except Exception as e:
        logger.error(f"[rembg-worker] Không thể tải model U2Net: {str(e)}")

    # 2. Tải Model xóa vật thể LaMa
    logger.info("[rembg-worker] Đang tải AI model LaMa Inpainting vào bộ nhớ...")
    try:
        # pyrefly: ignore [missing-import]
        import torch
        torch.set_num_threads(1)
        
        # Vá lỗi (Monkey-patch) thư viện simple-lama-inpainting: 
        # Thư viện này mặc định gọi torch.jit.load mà không có map_location='cpu',
        # khiến mô hình bị ép load vào CUDA và gây crash. Ta sẽ chặn lại!
        original_jit_load = torch.jit.load
        def safe_jit_load(*args, **kwargs):
            kwargs['map_location'] = 'cpu'
            return original_jit_load(*args, **kwargs)
        torch.jit.load = safe_jit_load

        # pyrefly: ignore [missing-import]
        from simple_lama_inpainting import SimpleLama
        SIMPLE_LAMA = SimpleLama(device="cpu")
        
        # Trả lại hàm gốc sau khi load xong
        torch.jit.load = original_jit_load

        logger.info("[rembg-worker] Model LaMa Inpainting đã tải thành công!")
    except Exception as e:
        logger.warning(
            f"[rembg-worker] Không thể tải LaMa Inpainting (sẽ sử dụng OpenCV Telea làm phương án dự phòng): {str(e)}"
        )

@app.get("/health")
async def health_check():
    """Kiểm tra trạng thái hoạt động của các AI Model."""
    return {
        "status": "ok",
        "rembg_model": "u2net",
        "rembg_loaded": REMBG_SESSION is not None,
        "inpainting_lama_loaded": SIMPLE_LAMA is not None,
        "fallback_engine": "opencv-telea-local",
        "service": "AI Image Processing Worker"
    }

@app.post("/remove-bg")
async def remove_background(image: UploadFile = File(...)):
    """
    Nhận file ảnh (PNG, JPG, WebP) và trả về ảnh PNG trong suốt (đã xóa nền) bằng AI U2Net.
    """
    if REMBG_SESSION is None:
        raise HTTPException(status_code=503, detail="Model U2Net chưa sẵn sàng hoặc tải lỗi. Vui lòng thử lại sau.")

    try:
        logger.info(f"[rembg-worker] Đang bóc tách nền cho ảnh: {image.filename} ({image.content_type})")

        # Đọc dữ liệu nhị phân của ảnh
        input_bytes = await image.read()
        if not input_bytes:
            raise HTTPException(status_code=400, detail="File ảnh rỗng.")

        # Tách nền bằng AI U2Net thông qua rembg
        output_bytes = remove(input_bytes, session=REMBG_SESSION)

        logger.info(f"[rembg-worker] Bóc tách nền thành công! Kích thước kết quả: {len(output_bytes)} bytes")

        # Trả về ảnh PNG trong suốt dưới dạng binary response
        return Response(
            content=output_bytes,
            media_type="image/png",
            headers={"X-Processed-By": "rembg-u2net-local"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[rembg-worker] Lỗi xử lý tách nền: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi tách nền nội bộ: {str(e)}")

@app.post("/inpaint")
async def inpaint(image: UploadFile = File(...), mask: UploadFile = File(...)):
    """
    Nhận file ảnh gốc và file mặt nạ mask, thực hiện inpainting xóa đối tượng bằng LaMa AI (hoặc OpenCV Telea dự phòng).
    """
    try:
        logger.info(f"[rembg-worker] Tiếp nhận yêu cầu Inpainting xóa đối tượng cho ảnh: {image.filename}")

        # 1. Đọc dữ liệu ảnh và mask từ upload stream
        image_bytes = await image.read()
        mask_bytes = await mask.read()

        if not image_bytes or not mask_bytes:
            raise HTTPException(status_code=400, detail="File ảnh gốc hoặc mask rỗng.")

        # 2. Decode sang OpenCV numpy arrays để xử lý hình học
        nparr_img = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr_img, cv2.IMREAD_COLOR)

        nparr_mask = np.frombuffer(mask_bytes, np.uint8)
        mask_img = cv2.imdecode(nparr_mask, cv2.IMREAD_GRAYSCALE)

        if img is None:
            raise HTTPException(status_code=400, detail="Không thể đọc được ảnh gốc.")
        if mask_img is None:
            raise HTTPException(status_code=400, detail="Không thể đọc được mặt nạ mask.")

        # 3. Đảm bảo mask cùng kích thước với ảnh gốc
        if mask_img.shape[:2] != img.shape[:2]:
            logger.info(f"[rembg-worker] Đang resize mask {mask_img.shape[:2]} khớp với size ảnh gốc {img.shape[:2]}...")
            mask_img = cv2.resize(mask_img, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)

        # 4. CHẠY MÔ HÌNH XÓA VẬT THỂ
        # ƯU TIÊN 1: Sử dụng LaMa AI chuyên nghiệp (nếu đã được cài đặt thành công)
        if SIMPLE_LAMA is not None:
            try:
                logger.info("[rembg-worker] Đang tiến hành xóa vật thể bằng AI Model LaMa...")
                
                # Chuyển BGR (OpenCV) sang RGB (Pillow) để nạp vào LaMa
                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                img_pil = Image.fromarray(img_rgb)
                mask_pil = Image.fromarray(mask_img)

                # Tối ưu hóa bộ nhớ: Tự động downscale ảnh nếu vượt quá 512px để tránh OOM trên máy chủ cấu hình yếu
                original_width, original_height = img_pil.size
                max_size = 512
                is_resized = False
                
                if max(original_width, original_height) > max_size:
                    logger.info(f"[rembg-worker] Ảnh quá lớn ({original_width}x{original_height}). Tự động resize xuống max {max_size}px để tránh crash RAM...")
                    ratio = max_size / max(original_width, original_height)
                    new_width = int(original_width * ratio)
                    new_height = int(original_height * ratio)
                    
                    img_pil = img_pil.resize((new_width, new_height), Image.LANCZOS)
                    mask_pil = mask_pil.resize((new_width, new_height), Image.NEAREST)
                    is_resized = True

                # Chạy mô hình sinh ảnh lấp đầy vùng trống
                result_pil = SIMPLE_LAMA(img_pil, mask_pil)

                # Nếu đã resize thì khôi phục lại kích thước gốc để đảm bảo chất lượng ảnh cho người dùng
                if is_resized:
                    logger.info(f"[rembg-worker] Khôi phục kích thước ảnh gốc ({original_width}x{original_height})...")
                    result_pil = result_pil.resize((original_width, original_height), Image.LANCZOS)

                # Chuyển đổi ngược từ Pillow về numpy array để encode
                result_np = np.array(result_pil)
                result_bgr = cv2.cvtColor(result_np, cv2.COLOR_RGB2BGR)

                _, encoded_img = cv2.imencode(".png", result_bgr)
                output_bytes = encoded_img.tobytes()

                logger.info("[rembg-worker] Đã xóa vật thể thành công bằng LaMa AI!")
                return Response(
                    content=output_bytes,
                    media_type="image/png",
                    headers={"X-Processed-By": "lama-ai-local"}
                )

            except Exception as e:
                logger.error(f"[rembg-worker] Gặp sự cố khi chạy LaMa AI, kích hoạt chế độ dự phòng OpenCV: {str(e)}")

        # ƯU TIÊN 2 / DỰ PHÒNG: Sử dụng thuật toán toán học OpenCV Telea
        logger.info("[rembg-worker] Đang tiến hành xóa vật thể bằng thuật toán toán học OpenCV Telea...")
        result = cv2.inpaint(img, mask_img, 7, cv2.INPAINT_TELEA)

        # Encode kết quả ra bytes ảnh PNG
        _, encoded_img = cv2.imencode(".png", result)
        output_bytes = encoded_img.tobytes()

        logger.info(f"[rembg-worker] Đã xóa vật thể thành công bằng OpenCV Telea! Kích thước: {len(output_bytes)} bytes")

        return Response(
            content=output_bytes,
            media_type="image/png",
            headers={"X-Processed-By": "opencv-telea-local"}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[rembg-worker] Lỗi xử lý Inpainting: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi Inpainting nội bộ: {str(e)}")

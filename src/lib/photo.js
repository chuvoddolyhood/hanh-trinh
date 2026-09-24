import exifr from 'exifr';
import imageCompression from 'browser-image-compression';

// Đọc GPS và thời điểm chụp từ EXIF. Trả về null cho trường nào không có.
export async function readPhotoMeta(file) {
  let gps = null;
  let takenAt = null;

  try {
    // exifr.gps trả về undefined nếu ảnh không có toạ độ
    const g = await exifr.gps(file);
    if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude)) {
      gps = { lat: g.latitude, lng: g.longitude };
    }
  } catch {
    // Ảnh hỏng hoặc định dạng không đọc được EXIF: bỏ qua
  }

  try {
    const meta = await exifr.parse(file, ['DateTimeOriginal']);
    if (meta?.DateTimeOriginal instanceof Date && !Number.isNaN(meta.DateTimeOriginal.getTime())) {
      takenAt = meta.DateTimeOriginal;
    }
  } catch {
    // Không có ngày chụp: bỏ qua
  }

  return { gps, takenAt };
}

// Nén ảnh về JPEG ~300KB, cạnh dài tối đa 1920px.
// Ảnh được vẽ lại qua canvas nên toàn bộ EXIF (kể cả GPS) bị loại bỏ — bảo vệ quyền riêng tư.
export function compressPhoto(file) {
  return imageCompression(file, {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: 'image/jpeg',
  });
}

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

export const isHeic = (file) => /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

// Ảnh HEIC (iPhone) → JPEG, vì Chrome/Android không giải mã được HEIC để xem trước và nén.
// Gọi sau readPhotoMeta: bản JPEG không còn EXIF. Thư viện ~3 MB nên chỉ tải khi gặp ảnh HEIC.
export async function toJpegIfHeic(file) {
  if (!isHeic(file)) return file;
  const { heicTo } = await import('heic-to');
  const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
  return new File([blob], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' });
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

// Ảnh nhỏ cho thẻ, nhật ký, story (~40KB, cạnh dài 400px: đủ nét cho polaroid 138px ở màn hình 3x)
export function compressThumb(file) {
  return imageCompression(file, {
    maxSizeMB: 0.04,
    maxWidthOrHeight: 400,
    useWebWorker: true,
    fileType: 'image/jpeg',
  });
}

// Ảnh nhỏ nằm cạnh ảnh gốc: <uuid>.jpg → <uuid>_t.jpg (policy Storage quy về ảnh gốc để kiểm tra quyền)
export const thumbPath = (path) => path.replace(/\.jpg$/, '_t.jpg');

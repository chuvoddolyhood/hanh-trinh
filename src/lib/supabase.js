import { createClient } from '@supabase/supabase-js';

// Đọc cấu hình từ file .env (Vite chỉ public các biến có tiền tố VITE_)
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Cho phép app hiển thị hướng dẫn thay vì crash khi chưa cấu hình
export const isConfigured = Boolean(url && anonKey);

export const supabase = isConfigured ? createClient(url, anonKey) : null;

// Tên bucket lưu ảnh (khớp với supabase/schema.sql)
export const PHOTO_BUCKET = 'photos';

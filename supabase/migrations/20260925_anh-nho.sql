-- =====================================================================
-- Migration: ảnh nhỏ (<uuid>_t.jpg) cho bạn bè và link chia sẻ.
-- Chạy sau 20260925_giai-doan-2-3.sql. Dán vào Supabase SQL Editor, bấm Run; chạy lại nhiều lần vẫn được.
-- Chỉ thay 2 policy đọc Storage: ảnh nhỏ quy về ảnh gốc để kiểm tra quyền (bảng photos chỉ ghi ảnh gốc).
-- Nội dung giống supabase/schema.sql.
-- =====================================================================

begin;

drop policy if exists "photos_bucket_shared" on storage.objects;
create policy "photos_bucket_shared" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'photos' and private.is_shared_photo(regexp_replace(name, '_t\.jpg$', '.jpg')));

drop policy if exists "photos_bucket_friends" on storage.objects;
create policy "photos_bucket_friends" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.photos ph
      where ph.storage_path = regexp_replace(objects.name, '_t\.jpg$', '.jpg')
    )
  );

commit;

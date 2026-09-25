import { useEffect, useState } from 'react';
import * as api from '../lib/api';

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// Khoá VAPID dạng base64url → Uint8Array cho pushManager.subscribe
function keyBytes(base64url) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Tab Tôi: bật/tắt thông báo "Ngày này năm trước" (Web Push, gửi mỗi sáng)
export default function MemoriesPush() {
  const [sub, setSub] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && Boolean(VAPID_KEY);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((s) => setSub(s ?? null))
      .catch(() => {});
  }, [supported]);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) throw new Error('Chỉ bật được trên bản đã deploy (bản chạy thử trên máy không có service worker).');
      if ((await Notification.requestPermission()) !== 'granted') {
        throw new Error('Bạn chưa cho phép thông báo. Mở cài đặt trình duyệt để cho phép rồi thử lại.');
      }
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_KEY) });
      await api.savePushSubscription(s);
      setSub(s);
      setMessage('Đã bật. Mỗi sáng có nơi bạn từng đến vào ngày này, app sẽ nhắc.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      await api.deletePushSubscription(sub.endpoint);
      await sub.unsubscribe();
      setSub(null);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  let help = 'Thông báo mỗi sáng khi có nơi bạn từng đến vào đúng ngày này ở các năm trước.';
  if (!VAPID_KEY) help = 'Chưa cấu hình VITE_VAPID_PUBLIC_KEY (xem README).';
  else if (isIos && !isStandalone) help = 'Trên iPhone, thêm app vào màn hình chính trước (Chia sẻ → Thêm vào MH chính), rồi mở app từ đó để bật.';
  else if (!supported) help = 'Trình duyệt này không hỗ trợ thông báo đẩy.';

  return (
    <section className="stack-sm">
      <h2 className="section-title">Nhắc "Ngày này năm trước"</h2>
      <p className="help">{help}</p>
      {supported && !(isIos && !isStandalone) && (
        <button type="button" className="btn-pill btn-outline" onClick={sub ? disable : enable} disabled={busy}>
          {sub ? 'Tắt thông báo' : 'Bật thông báo'}
        </button>
      )}
      {message && <p className="notice">{message}</p>}
    </section>
  );
}

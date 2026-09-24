import { useCallback, useEffect, useRef, useState } from 'react';
import { haversine } from '../lib/geo';

// Khoá lưu tạm lộ trình đang ghi — khôi phục được nếu tab bị tải lại hoặc trình duyệt bị đóng
const RECOVERY_KEY = 'hanh-trinh:unsaved-track';

function loadRecovery() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECOVERY_KEY));
    return Array.isArray(saved?.points) ? saved : null;
  } catch {
    return null;
  }
}

function saveRecovery(startedAt, points, pausedMs = 0) {
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ startedAt, points, pausedMs }));
  } catch {
    // Hết dung lượng hoặc bị chặn: bỏ qua, không ảnh hưởng việc ghi
  }
}

/**
 * Ghi lộ trình bằng Geolocation API.
 * - maxAccuracy: bỏ điểm có sai số lớn hơn (mét)
 * - maxSpeedKmh: bỏ điểm "nhảy" nhanh bất thường so với đi bộ
 * - minStepM: bỏ điểm quá sát điểm trước (đứng yên vẫn nhận GPS dao động)
 */
export function useTracker({ maxAccuracy = 30, maxSpeedKmh = 15, minStepM = 3 } = {}) {
  const recovered = useRef(loadRecovery());
  const [points, setPoints] = useState(recovered.current?.points ?? []);
  const [startedAt, setStartedAt] = useState(recovered.current?.startedAt ?? null);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  // Tổng thời gian đã tạm dừng (ms) và thời điểm bắt đầu lần dừng hiện tại
  const [pausedMs, setPausedMs] = useState(recovered.current?.pausedMs ?? 0);
  const [pausedAt, setPausedAt] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(null);
  const [screenLocked, setScreenLocked] = useState(false); // true = đang giữ màn hình sáng

  const pointsRef = useRef(points);
  const startedAtRef = useRef(startedAt); // Ref để handlePosition không phụ thuộc state
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const rejectStreakRef = useRef(0);
  const pausedMsRef = useRef(pausedMs);
  const resumedRef = useRef(false); // Điểm đầu sau khi tiếp tục: bỏ qua kiểm tra tốc độ

  // Giữ màn hình sáng để trình duyệt không ngừng cập nhật GPS
  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setScreenLocked(true);
      sentinel.addEventListener('release', () => setScreenLocked(false));
    } catch {
      setScreenLocked(false); // Bị từ chối (pin yếu, chế độ tiết kiệm...)
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // Wake lock tự mất khi tab bị ẩn → xin lại khi người dùng quay lại
  useEffect(() => {
    if (!recording || paused) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [recording, paused, acquireWakeLock]);

  const handlePosition = useCallback(
    (pos) => {
      const { latitude, longitude, accuracy: acc } = pos.coords;
      setAccuracy(acc);
      if (acc > maxAccuracy) return;

      const point = [longitude, latitude, pos.timestamp];
      const prev = pointsRef.current[pointsRef.current.length - 1];

      if (prev) {
        const d = haversine(prev, point);
        if (d < minStepM) return;
        const dtSec = (point[2] - prev[2]) / 1000;
        // ponytail: sau tạm dừng nối thẳng điểm cũ với điểm mới (quãng đường tính cả đoạn nối); cần lộ trình nhiều đoạn thì đổi định dạng points
        const tooFast = !resumedRef.current && dtSec > 0 && (d / dtSec) * 3.6 > maxSpeedKmh;
        // Chấp nhận nếu bị loại liên tiếp 3 lần: có thể chính điểm trước mới là điểm sai
        if (tooFast && rejectStreakRef.current < 3) {
          rejectStreakRef.current += 1;
          return;
        }
      }

      rejectStreakRef.current = 0;
      resumedRef.current = false;
      const next = [...pointsRef.current, point];
      pointsRef.current = next;
      setPoints(next);
      saveRecovery(startedAtRef.current, next, pausedMsRef.current);
    },
    [maxAccuracy, maxSpeedKmh, minStepM],
  );

  const handleError = useCallback((err) => {
    const messages = {
      1: 'Bạn chưa cho phép truy cập vị trí. Hãy bật quyền vị trí cho trang này trong cài đặt trình duyệt.',
      2: 'Không xác định được vị trí. Hãy ra chỗ thoáng hoặc bật GPS.',
      3: 'Lấy vị trí quá lâu. Đang tiếp tục thử…',
    };
    setError(messages[err.code] ?? err.message);
  }, []);

  // Bật/tắt theo dõi GPS và giữ màn hình sáng
  const watch = useCallback(() => {
    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });
    acquireWakeLock();
  }, [handlePosition, handleError, acquireWakeLock]);

  const unwatch = useCallback(() => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    releaseWakeLock();
  }, [releaseWakeLock]);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Trình duyệt này không hỗ trợ định vị.');
      return;
    }
    const now = Date.now();
    pointsRef.current = [];
    startedAtRef.current = now;
    rejectStreakRef.current = 0;
    pausedMsRef.current = 0;
    setPoints([]);
    setStartedAt(now);
    setPausedMs(0);
    setPausedAt(null);
    setPaused(false);
    setError(null);
    saveRecovery(now, []);
    watch();
    setRecording(true);
  }, [watch]);

  const pause = useCallback(() => {
    unwatch();
    setPaused(true);
    setPausedAt(Date.now());
  }, [unwatch]);

  const resume = useCallback(() => {
    const total = pausedMsRef.current + (Date.now() - (pausedAt ?? Date.now()));
    pausedMsRef.current = total;
    setPausedMs(total);
    setPausedAt(null);
    setPaused(false);
    resumedRef.current = true;
    saveRecovery(startedAtRef.current, pointsRef.current, total);
    watch();
  }, [pausedAt, watch]);

  // Kết thúc ghi, giữ lại điểm để người dùng lưu. Trả về danh sách điểm.
  const stop = useCallback(() => {
    if (pausedAt != null) {
      pausedMsRef.current += Date.now() - pausedAt;
      setPausedMs(pausedMsRef.current);
      setPausedAt(null);
    }
    unwatch();
    setPaused(false);
    setRecording(false);
    return pointsRef.current;
  }, [pausedAt, unwatch]);

  // Xoá lộ trình tạm (sau khi đã lưu lên server hoặc người dùng huỷ)
  const reset = useCallback(() => {
    pointsRef.current = [];
    startedAtRef.current = null;
    pausedMsRef.current = 0;
    setPoints([]);
    setStartedAt(null);
    setPausedMs(0);
    setAccuracy(null);
    setError(null);
    try {
      localStorage.removeItem(RECOVERY_KEY);
    } catch {
      // Bỏ qua
    }
  }, []);

  // Dọn dẹp khi component bị huỷ
  useEffect(
    () => () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      wakeLockRef.current?.release().catch(() => {});
    },
    [],
  );

  return {
    recording, paused, points, startedAt, pausedMs, pausedAt, accuracy, error, screenLocked,
    start, pause, resume, stop, reset,
  };
}

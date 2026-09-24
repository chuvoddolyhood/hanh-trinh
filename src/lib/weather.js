// Thời tiết lịch sử theo ngày từ Open-Meteo (miễn phí, không cần API key)

// Bảng mã thời tiết WMO → mô tả tiếng Việt
const WMO_VI = {
  0: 'Trời quang', 1: 'Ít mây', 2: 'Có mây', 3: 'Nhiều mây',
  45: 'Sương mù', 48: 'Sương mù đóng băng',
  51: 'Mưa phùn nhẹ', 53: 'Mưa phùn', 55: 'Mưa phùn dày',
  56: 'Mưa phùn băng', 57: 'Mưa phùn băng dày',
  61: 'Mưa nhẹ', 63: 'Mưa vừa', 65: 'Mưa to',
  66: 'Mưa băng nhẹ', 67: 'Mưa băng',
  71: 'Tuyết nhẹ', 73: 'Tuyết', 75: 'Tuyết dày', 77: 'Hạt tuyết',
  80: 'Mưa rào nhẹ', 81: 'Mưa rào', 82: 'Mưa rào mạnh',
  85: 'Mưa tuyết nhẹ', 86: 'Mưa tuyết',
  95: 'Dông', 96: 'Dông kèm mưa đá', 99: 'Dông kèm mưa đá lớn',
};

const DAY_MS = 86_400_000;

// dateStr: "YYYY-MM-DD". Trả về { code, text, tmax, tmin } hoặc null nếu không lấy được.
export async function fetchDailyWeather(lat, lng, dateStr) {
  const ageDays = (Date.now() - new Date(`${dateStr}T12:00:00`).getTime()) / DAY_MS;
  if (ageDays < -14) return null; // Dự báo chỉ có khoảng 2 tuần tới

  // Dữ liệu lưu trữ (archive) trễ vài ngày → ngày gần đây dùng endpoint forecast
  const endpoint = ageDays > 7
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast';

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    start_date: dateStr,
    end_date: dateStr,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
  });

  const res = await fetch(`${endpoint}?${params}`);
  if (!res.ok) return null;

  const daily = (await res.json())?.daily;
  const code = daily?.weather_code?.[0];
  if (code == null) return null;

  return {
    code,
    text: WMO_VI[code] ?? 'Không rõ',
    tmax: daily.temperature_2m_max?.[0] ?? null,
    tmin: daily.temperature_2m_min?.[0] ?? null,
  };
}

// Thời tiết hiện tại tại một vị trí → { code, temp } hoặc null
export async function fetchCurrentWeather(lat, lng) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: 'temperature_2m,weather_code',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) return null;
  const cur = (await res.json())?.current;
  return cur?.weather_code == null ? null : { code: cur.weather_code, temp: cur.temperature_2m };
}

// Nhóm mã WMO theo bảng màu quả cầu aura trong DESIGN.md
export function weatherKind(code) {
  if (code == null) return 'cloud';
  if (code <= 1) return 'clear';
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  return 'cloud';
}

// Một từ ngắn cho thời tiết: "Nắng", "Mây", "Mưa"...
export function weatherWord(code) {
  if (code == null) return '';
  if (code >= 71 && code <= 77) return 'Tuyết';
  if (code === 85 || code === 86) return 'Tuyết';
  if (code === 45 || code === 48) return 'Sương';
  return { clear: 'Nắng', cloud: 'Mây', rain: 'Mưa', storm: 'Dông' }[weatherKind(code)];
}

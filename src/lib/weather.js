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

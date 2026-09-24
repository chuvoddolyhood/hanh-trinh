import { weatherWord } from '../lib/weather';

// Danh sách cảm xúc dùng chung cho form check-in và hiển thị nhật ký
export const MOODS = [
  { id: 'vui', label: 'Vui', emoji: '😄' },
  { id: 'binh-yen', label: 'Bình yên', emoji: '😌' },
  { id: 'hao-hung', label: 'Hào hứng', emoji: '🤩' },
  { id: 'met', label: 'Mệt', emoji: '🥱' },
  { id: 'buon', label: 'Buồn', emoji: '😔' },
];

export const moodEmoji = (id) => MOODS.find((m) => m.id === id)?.emoji ?? '';
export const moodLabel = (id) => MOODS.find((m) => m.id === id)?.label ?? '';

// Dòng tóm tắt dưới tên địa điểm: "3 ảnh, bình yên, nắng 33°C"
export function placeSummary(p) {
  const w = p.weather;
  return [
    p.photos.length > 0 && `${p.photos.length} ảnh`,
    p.mood && moodLabel(p.mood).toLowerCase(),
    w && `${weatherWord(w.code).toLowerCase()}${w.tmax != null ? ` ${Math.round(w.tmax)}°C` : ''}`,
  ].filter(Boolean).join(', ');
}

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

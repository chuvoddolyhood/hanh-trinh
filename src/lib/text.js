// Chuẩn hoá chuỗi tiếng Việt để tìm kiếm không phân biệt dấu: "Đà Lạt" → "da lat"
export function normalizeVi(str) {
  return (str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

// "biển, Đà Nẵng ,  bien" → ["biển", "đà nẵng"] (chữ thường, bỏ trùng theo dạng không dấu)
export function parseTags(input) {
  const seen = new Set();
  const tags = [];
  for (const raw of input.split(',')) {
    const tag = raw.trim().replace(/^#/, '').toLowerCase();
    const key = normalizeVi(tag);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

// Địa điểm có khớp chuỗi tìm kiếm không: "#tag" tìm theo tag, còn lại tìm trong tên, ghi chú, tag (không dấu)
export function matchPlace(place, query) {
  const q = normalizeVi(query);
  if (!q) return true;
  if (q.startsWith('#')) return place.tags.some((t) => normalizeVi(t).startsWith(q.slice(1)));
  return normalizeVi([place.name, place.note, ...place.tags].join(' ')).includes(q);
}

// Chi phí chuyến đi: tiền VND (số nguyên). Tính ở máy từ bảng trip_expenses.

// Mỗi người: đã trả trừ phần phải chịu → Map<userId, số dư> (dương = được nhận lại, âm = còn nợ).
// Chia đều; phần lẻ (vài đồng) dồn cho những người đầu danh sách để tổng khớp đúng số tiền.
export function balances(expenses) {
  const out = new Map();
  const add = (id, v) => out.set(id, (out.get(id) ?? 0) + v);
  for (const e of expenses) {
    add(e.paid_by, e.amount);
    const n = e.split_among.length;
    const base = Math.floor(e.amount / n);
    e.split_among.forEach((id, i) => add(id, -(base + (i < e.amount - base * n ? 1 : 0))));
  }
  return out;
}

// Ai trả ai bao nhiêu để cân bằng: người nợ nhiều nhất trả người được nhận nhiều nhất, lặp lại.
// → [{ from, to, amount }], tối đa (số người - 1) lần chuyển.
export function settle(balanceMap) {
  const debtors = [];
  const creditors = [];
  for (const [id, v] of balanceMap) {
    if (v < 0) debtors.push([id, -v]);
    else if (v > 0) creditors.push([id, v]);
  }
  debtors.sort((a, b) => b[1] - a[1]);
  creditors.sort((a, b) => b[1] - a[1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i][1], creditors[j][1]);
    out.push({ from: debtors[i][0], to: creditors[j][0], amount });
    debtors[i][1] -= amount;
    creditors[j][1] -= amount;
    if (debtors[i][1] === 0) i++;
    if (creditors[j][1] === 0) j++;
  }
  return out;
}

export const formatVnd = (n) => `${n.toLocaleString('vi-VN')} đ`;

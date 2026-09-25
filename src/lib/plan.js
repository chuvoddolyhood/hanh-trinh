// Kế hoạch chuyến đi: sắp thứ tự điểm dừng cho đường đi ngắn.
import { haversine } from './geo';

// Láng giềng gần nhất, thử mỗi điểm làm điểm xuất phát, lấy đường ngắn nhất (đường mở, không quay về).
// → mảng chỉ số theo thứ tự đi. ponytail: O(n³), đủ nhanh tới ~60 điểm; nhiều hơn thì cần 2-opt hoặc chỉ thử vài điểm đầu
export function planOrder(points) {
  let best = null;
  let bestLen = Infinity;
  for (let start = 0; start < points.length; start++) {
    const order = [start];
    const left = new Set(points.keys());
    left.delete(start);
    let len = 0;
    while (left.size) {
      const cur = points[order.at(-1)];
      let next = -1;
      let nextD = Infinity;
      for (const i of left) {
        const d = haversine(cur, points[i]);
        if (d < nextD) {
          nextD = d;
          next = i;
        }
      }
      order.push(next);
      left.delete(next);
      len += nextD;
    }
    if (len < bestLen) {
      bestLen = len;
      best = order;
    }
  }
  return best ?? [];
}

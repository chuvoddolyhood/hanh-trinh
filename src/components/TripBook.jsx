import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as api from '../lib/api';
import Icon from './icons';
import { usePhotoUrls } from '../hooks/usePhotoUrls';
import { formatDate, formatDateLong, todayStr } from '../lib/dates';
import { formatDistance } from '../lib/geo';
import { balances, settle, formatVnd } from '../lib/expenses';
import { placeSummary } from './moods';

/**
 * Sổ tay chuyến đi: trang gọn để in hoặc lưu PDF (hộp in của trình duyệt).
 * Render ra ngoài #root bằng portal: khi in, CSS ẩn #root (bản đồ, thanh tab) và chỉ in trang này.
 * places: nơi đã đến theo thứ tự thời gian; nameOf(userId) → tên hiển thị (chi phí chuyến nhóm).
 */
export default function TripBook({ trip, places, tracks, km, days, nameOf, onClose }) {
  const [expenses, setExpenses] = useState([]);
  const urls = usePhotoUrls(places.flatMap((p) => p.photos.slice(0, 4).map((ph) => ph.storage_path)), { thumb: true });
  const people = 1 + trip.members.length;

  useEffect(() => {
    api.listExpenses(trip.id).then(setExpenses).catch(() => {}); // Không tải được thì bỏ phần chi phí
  }, [trip.id]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const transfers = people > 1 ? settle(balances(expenses)) : [];

  return createPortal(
    <article className="book" aria-label={`Sổ tay ${trip.name}`}>
      <div className="book-actions">
        <button type="button" className="round-btn" onClick={onClose} aria-label="Đóng sổ tay">
          <Icon name="back" size={20} strokeWidth={2} />
        </button>
        <button type="button" className="btn-pill btn-dark" onClick={() => window.print()}>
          In / lưu PDF
        </button>
      </div>

      <header className="book-head">
        <span className="mono-label">SỔ TAY CHUYẾN ĐI</span>
        <h1>{trip.name}</h1>
        <p className="muted">
          {formatDate(trip.start_date)}
          {trip.end_date !== trip.start_date && ` – ${formatDate(trip.end_date)}`}, {days} ngày, {places.length} nơi
          {km > 0 && `, ${formatDistance(km)} đi bộ`}
        </p>
        {trip.note && <p>{trip.note}</p>}
      </header>

      {places.map((p) => (
        <section key={p.id} className="book-place">
          <span className="mono-label">{formatDateLong(p.visited_at).toUpperCase()}</span>
          <h2>{p.name}</h2>
          {placeSummary(p) && <p className="muted-sm">{placeSummary(p)}</p>}
          {p.note && <p>{p.note}</p>}
          {p.tags.length > 0 && <p className="muted-sm">{p.tags.map((t) => `#${t}`).join(' ')}</p>}
          {p.photos.length > 0 && (
            <div className="book-photos">
              {p.photos.slice(0, 4).map((ph) => (
                urls[ph.storage_path] && <img key={ph.id} src={urls[ph.storage_path]} alt={`Ảnh tại ${p.name}`} />
              ))}
            </div>
          )}
        </section>
      ))}

      {tracks.length > 0 && (
        <section className="book-section">
          <h2>Lộ trình</h2>
          <ul>
            {tracks.map((t) => (
              <li key={t.id}>{t.name}: {formatDistance(t.distance_m)}</li>
            ))}
          </ul>
        </section>
      )}

      {expenses.length > 0 && (
        <section className="book-section">
          <h2>Chi phí</h2>
          <p>
            Tổng {formatVnd(total)}
            {people > 1 && `, trung bình ${formatVnd(Math.round(total / people))} mỗi người`}.
          </p>
          <ul>
            {expenses.map((e) => (
              <li key={e.id}>
                {e.title}: {formatVnd(e.amount)}
                {people > 1 && ` (${nameOf(e.paid_by)} trả)`}
              </li>
            ))}
          </ul>
          {transfers.length > 0 && (
            <>
              <h3>Ai trả ai</h3>
              <ul>
                {transfers.map((t) => (
                  <li key={`${t.from}-${t.to}`}>{nameOf(t.from)} trả {nameOf(t.to)} {formatVnd(t.amount)}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <footer className="muted-sm book-foot">Hành trình, in ngày {formatDate(todayStr())}</footer>
    </article>,
    document.body,
  );
}

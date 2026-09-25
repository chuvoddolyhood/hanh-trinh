import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../lib/api';
import Icon from './icons';

const timeLabel = (iso) =>
  new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

// Thả tim và bình luận của một địa điểm, cập nhật tức thì qua Supabase Realtime.
// Chỉ chủ địa điểm và bạn bè xem được nơi đó mới thấy phần này (RLS).
export default function PlaceSocial({ placeId, userId, isOwner }) {
  const [comments, setComments] = useState([]);
  const [likes, setLikes] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const commentIds = useRef(new Set());

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([api.listComments(placeId), api.listReactions(placeId)]);
      commentIds.current = new Set(c.map((x) => x.id));
      setComments(c);
      setLikes(r);
    } catch (e) {
      setError(e.message);
    }
  }, [placeId]);

  useEffect(() => {
    load();
    return api.subscribePlace(placeId, ({ eventType, old }) => {
      // DELETE đến từ mọi địa điểm: chỉ tải lại khi đúng là của nơi này
      if (eventType === 'DELETE' && old.place_id !== placeId && !commentIds.current.has(old.id)) return;
      load();
    });
  }, [placeId, load]);

  const liked = likes.includes(userId);

  async function toggleLike() {
    setLikes((l) => (liked ? l.filter((id) => id !== userId) : [...l, userId])); // Cập nhật trước cho nhanh
    try {
      await api.setReaction(placeId, userId, !liked);
    } catch (e) {
      setError(e.message);
      load();
    }
  }

  async function send(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await api.addComment(placeId, text);
      setBody('');
      await load();
    } catch (err) {
      setError(`Chưa gửi được: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    if (!window.confirm('Xoá bình luận này?')) return;
    try {
      await api.deleteComment(c.id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="stack-sm social">
      <div className="row social-bar">
        <button
          type="button"
          className={`like-btn${liked ? ' is-liked' : ''}`}
          aria-pressed={liked}
          onClick={toggleLike}
        >
          <Icon name="heart" size={20} />
          {likes.length > 0 ? likes.length : 'Thả tim'}
        </button>
        <span className="muted-sm">{comments.length} bình luận</span>
      </div>

      {comments.length > 0 && (
        <ul className="comments">
          {comments.map((c) => (
            <li key={c.id}>
              <div className="comment-head">
                <strong>{c.user_id === userId ? 'Bạn' : c.author?.display_name ?? 'Ai đó'}</strong>
                <span className="muted-sm">{timeLabel(c.created_at)}</span>
                {(c.user_id === userId || isOwner) && (
                  <button type="button" className="btn-link comment-del" onClick={() => remove(c)}>Xoá</button>
                )}
              </div>
              <p className="note">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form className="search-row" onSubmit={send}>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          placeholder="Viết bình luận…"
          aria-label="Bình luận"
        />
        <button type="submit" className="btn" disabled={busy || !body.trim()}>Gửi</button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

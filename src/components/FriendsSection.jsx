import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api';
import Icon from './icons';

const inviteUrl = (token) => `${window.location.origin}/?invite=${token}`;

// Tab Tôi: hồ sơ (tên, username), link mời, tìm bạn theo @username, lời mời và danh sách bạn bè
export default function FriendsSection({ userId, onViewFriend, refreshKey }) {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [friendships, setFriendships] = useState([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([api.getMyProfile(userId), api.listFriendships(userId)]);
      setProfile(p);
      setName(p.display_name);
      setUsername(p.username ?? '');
      setFriendships(f);
    } catch (e) {
      setMessage(`Không tải được bạn bè: ${e.message}`);
    }
  }, [userId]);

  // refreshKey đổi khi vừa nhận link mời ở App
  useEffect(() => { load(); }, [load, refreshKey]);

  // Chạy một thao tác, báo kết quả, rồi tải lại danh sách
  async function run(action, done) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      setMessage(typeof done === 'function' ? done(result) : done);
      await load();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  function saveProfile(e) {
    e.preventDefault();
    run(
      () => api.updateProfile(userId, { display_name: name.trim(), username: username.trim().toLowerCase() || null }),
      'Đã lưu hồ sơ.',
    );
  }

  async function shareInvite() {
    const url = inviteUrl(profile.inviteToken);
    try {
      if (navigator.share) await navigator.share({ title: 'Kết bạn trên Hành trình', url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Đã sao chép link mời.');
      }
    } catch {
      // Người dùng huỷ bảng chia sẻ
    }
  }

  function renewInvite() {
    if (!window.confirm('Tạo link mời mới? Link cũ sẽ không dùng được nữa.')) return;
    run(() => api.renewInvite(userId), 'Đã tạo link mời mới.');
  }

  function addByUsername(e) {
    e.preventDefault();
    run(async () => {
      const found = await api.findProfile(search);
      if (!found) throw new Error(`Không tìm thấy @${search.replace(/^@/, '')}.`);
      const status = await api.requestFriend(found.id);
      setSearch('');
      return { found, status };
    }, ({ found, status }) =>
      status === 'accepted' ? `Bạn và ${found.display_name} đã là bạn bè.` : `Đã gửi lời mời tới ${found.display_name}.`);
  }

  function remove(f, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    run(() => api.removeFriendship(userId, f.profile.id), null);
  }

  const incoming = friendships.filter((f) => f.status === 'pending' && f.incoming);
  const outgoing = friendships.filter((f) => f.status === 'pending' && !f.incoming);
  const friends = friendships.filter((f) => f.status === 'accepted');

  if (!profile) return message && <p className="notice">{message}</p>;

  return (
    <>
      <form className="stack-sm" onSubmit={saveProfile}>
        <h2 className="section-title">Hồ sơ</h2>
        <div className="date-range">
          <label>
            <span>Tên hiển thị</span>
            <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={30}
              pattern="[a-zA-Z0-9_.]{3,30}"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="vd: minh.an"
            />
          </label>
        </div>
        <p className="help">Bạn bè tìm bạn bằng username. Chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới.</p>
        <button type="submit" className="btn-pill btn-outline" disabled={busy}>Lưu hồ sơ</button>
      </form>

      <section className="stack-sm">
        <h2 className="section-title">Bạn bè</h2>
        <p className="help">Gửi link mời cho bạn qua Zalo, Messenger; bạn mở link và đăng nhập là thành bạn bè.</p>
        <div className="row">
          <button type="button" className="btn-pill btn-dark" onClick={shareInvite}>Gửi link mời</button>
          <button type="button" className="btn-pill btn-outline" onClick={renewInvite} disabled={busy}>Đổi link</button>
        </div>

        <form className="search-row" onSubmit={addByUsername}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            required
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="@username"
            aria-label="Username của bạn bè"
          />
          <button type="submit" className="btn" disabled={busy}>Kết bạn</button>
        </form>

        {message && <p className="notice">{message}</p>}

        {incoming.length > 0 && (
          <FriendList title="Lời mời kết bạn" items={incoming}>
            {(f) => (
              <>
                <button type="button" className="btn" onClick={() => run(() => api.acceptFriend(f.profile.id, userId), `Bạn và ${f.profile.display_name} đã là bạn bè.`)}>
                  Đồng ý
                </button>
                <button type="button" className="round-btn plain" onClick={() => remove(f)} aria-label={`Từ chối ${f.profile.display_name}`}>
                  <Icon name="close" size={18} />
                </button>
              </>
            )}
          </FriendList>
        )}

        {outgoing.length > 0 && (
          <FriendList title="Đã gửi lời mời" items={outgoing}>
            {(f) => (
              <button type="button" className="btn-link" onClick={() => remove(f)}>Huỷ</button>
            )}
          </FriendList>
        )}

        {friends.length === 0 && <p className="empty">Chưa có bạn bè nào.</p>}
        {friends.length > 0 && (
          <FriendList items={friends} onOpen={onViewFriend}>
            {(f) => (
              <button
                type="button"
                className="round-btn plain"
                onClick={() => remove(f, `Huỷ kết bạn với ${f.profile.display_name}?`)}
                aria-label={`Huỷ kết bạn với ${f.profile.display_name}`}
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </FriendList>
        )}
      </section>
    </>
  );
}

// Danh sách người: tên + @username, thao tác ở bên phải; onOpen → bấm tên để xem bản đồ của bạn
function FriendList({ title, items, onOpen, children }) {
  return (
    <div className="stack-xs">
      {title && <span className="mono-label">{title.toUpperCase()}</span>}
      <ul className="track-list friend-list">
        {items.map((f) => {
          const label = (
            <>
              <span className="track-name">{f.profile.display_name}</span>
              <span className="muted-sm">
                {f.profile.username ? `@${f.profile.username}` : ''}
                {onOpen && (f.profile.username ? ', xem bản đồ' : 'Xem bản đồ')}
              </span>
            </>
          );
          return (
            <li key={f.profile.id}>
              {onOpen ? (
                <button type="button" className="track-main" onClick={() => onOpen(f.profile)}>{label}</button>
              ) : (
                <span className="track-main">{label}</span>
              )}
              {children(f)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

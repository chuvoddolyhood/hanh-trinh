import { useState } from 'react';
import { supabase } from '../lib/supabase';

// Đăng nhập không mật khẩu: Supabase gửi link đăng nhập qua email
export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus('error');
      setMessage(error.message);
    } else {
      setStatus('sent');
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <h1 className="brand">Hành trình</h1>
        <p className="auth-lead">Ghim những nơi bạn đã đến, lưu ảnh và vẽ lại con đường bạn đã đi.</p>

        {status === 'sent' ? (
          <p className="notice">
            Đã gửi link đăng nhập tới <strong>{email}</strong>. Mở email trên thiết bị này và bấm vào link.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="stack">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@vidu.com"
              />
            </label>
            <button className="btn btn-primary" disabled={status === 'sending'}>
              {status === 'sending' ? 'Đang gửi…' : 'Gửi link đăng nhập'}
            </button>
            {status === 'error' && <p className="error">{message}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

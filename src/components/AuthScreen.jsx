import { useState } from 'react';
import { supabase } from '../lib/supabase';

// Lỗi Supabase Auth (theo error.code) → tiếng Việt
const ERRORS = {
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  email_not_confirmed: 'Tài khoản chưa xác nhận. Mở email xác nhận rồi đăng nhập lại.',
  user_already_exists: 'Email này đã có tài khoản. Hãy đăng nhập.',
  weak_password: 'Mật khẩu quá yếu. Dùng ít nhất 6 ký tự.',
  over_email_send_rate_limit: 'Đã gửi quá nhiều email. Thử lại sau ít phút.',
};

const MODES = {
  login: { title: 'Đăng nhập', submit: 'Đăng nhập' },
  signup: { title: 'Tạo tài khoản', submit: 'Tạo tài khoản' },
  link: { title: 'Nhận link đăng nhập', submit: 'Gửi link' },
};

// Đăng nhập bằng email + mật khẩu: phiên lưu đúng trình duyệt đang dùng.
// Link qua email chỉ dùng khi quên/chưa có mật khẩu; vào được app thì đặt mật khẩu ở tab Tôi.
export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function switchMode(next) {
    setMode(next);
    setError('');
    setNotice('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const creds = { email: email.trim(), password };
    const redirect = { emailRedirectTo: window.location.origin };

    let result;
    if (mode === 'login') result = await supabase.auth.signInWithPassword(creds);
    else if (mode === 'signup') result = await supabase.auth.signUp({ ...creds, options: redirect });
    else result = await supabase.auth.signInWithOtp({ email: creds.email, options: redirect });

    setBusy(false);
    if (result.error) {
      setError(ERRORS[result.error.code] ?? result.error.message);
      return;
    }
    // Đăng nhập thành công thì App tự chuyển màn hình qua onAuthStateChange
    if (mode === 'signup' && !result.data.session) {
      setNotice('Đã gửi email xác nhận. Bấm link trong email, rồi quay lại đây đăng nhập bằng mật khẩu.');
    } else if (mode === 'link') {
      setNotice('Đã gửi link đăng nhập. Sau khi vào app, đặt mật khẩu ở tab Tôi để lần sau đăng nhập bằng mật khẩu.');
    }
  }

  return (
    <div className="auth">
      <div className="orb orb-corner" aria-hidden="true" />
      <div className="auth-card">
        <h1 className="brand">Hành trình</h1>
        <p className="auth-lead">Ghim những nơi bạn đã đến, lưu ảnh và vẽ lại con đường bạn đã đi.</p>

        <form onSubmit={handleSubmit} className="stack">
          <h2 className="section-title">{MODES[mode].title}</h2>
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
          {mode !== 'link' && (
            <label className="field">
              <span>Mật khẩu</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Đang xử lý…' : MODES[mode].submit}
          </button>
          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="notice">{notice}</p>}

          <div className="stack-xs">
            {mode !== 'login' && (
              <button type="button" className="btn-link" onClick={() => switchMode('login')}>Đã có mật khẩu? Đăng nhập</button>
            )}
            {mode !== 'signup' && (
              <button type="button" className="btn-link" onClick={() => switchMode('signup')}>Chưa có tài khoản? Tạo tài khoản</button>
            )}
            {mode !== 'link' && (
              <button type="button" className="btn-link" onClick={() => switchMode('link')}>Quên hoặc chưa có mật khẩu? Nhận link qua email</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

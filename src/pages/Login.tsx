import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isCloudConfigured, sendEmailCode, errorText, type OtpTicket } from '../cloudbase';
import './Login.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{4,8}$/;
const RESEND_SECONDS = 60;

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [countdown, setCountdown] = useState(0);
  const ticketRef = useRef<OtpTicket | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const sendCode = async () => {
    const mail = email.trim();
    if (!EMAIL_RE.test(mail)) {
      setError('请输入正确的邮箱地址');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      ticketRef.current = await sendEmailCode(mail);
      setEmail(mail);
      setStep('code');
      setCode('');
      setCountdown(RESEND_SECONDS);
      setNotice(`验证码已发送至 ${mail}，10 分钟内有效；如果没收到，看看垃圾箱。`);
    } catch (e) {
      setError(errorText(e, '验证码发送失败，请稍后重试'));
    }
    setBusy(false);
  };

  const verify = async () => {
    const value = code.trim();
    if (!CODE_RE.test(value)) {
      setError('请输入邮件里的验证码');
      return;
    }
    const ticket = ticketRef.current;
    if (!ticket) {
      setStep('email');
      setError('验证码已失效，请重新发送');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await ticket.verify(value);
      navigate('/profile', { replace: true });
    } catch (e) {
      setError(errorText(e, '验证失败，请重试'));
      setBusy(false);
    }
  };

  const backToEmail = () => {
    setStep('email');
    setCode('');
    setError('');
    setNotice('');
    setCountdown(0);
  };

  return (
    <div className="login-page">
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate(-1)}>‹ 返回</button>
        <h3>登录</h3>
        <span className="profile-header-spacer" />
      </div>

      {!isCloudConfigured ? (
        <div className="login-card">
          <div className="login-title">云端未配置</div>
          <div className="login-sub">
            用户系统需要先在腾讯云开发（CloudBase）控制台开通环境，并把环境 ID 填入项目配置后才能使用。
            在配置完成前，app 的记账、任务等全部功能不受影响。
          </div>
        </div>
      ) : (
        <div className="login-card">
          <div className="login-title">邮箱登录 / 注册</div>
          <div className="login-sub">第一次使用会自动创建账号，不需要单独注册。</div>

          <label className="login-label">邮箱</label>
          <input
            className="login-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            disabled={step === 'code' || busy}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && step === 'email' && !busy) sendCode();
            }}
          />

          {step === 'code' && (
            <>
              <label className="login-label">验证码</label>
              <input
                className="login-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="请输入邮件中的验证码"
                value={code}
                autoFocus
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) verify();
                }}
              />
            </>
          )}

          {notice && <div className="login-notice">{notice}</div>}
          {error && <div className="login-error">{error}</div>}

          {step === 'email' ? (
            <button className="login-btn" disabled={busy} onClick={sendCode}>
              {busy ? '发送中…' : '获取验证码'}
            </button>
          ) : (
            <>
              <button className="login-btn" disabled={busy} onClick={verify}>
                {busy ? '登录中…' : '登录'}
              </button>
              <div className="login-row">
                <button className="login-link" disabled={busy} onClick={backToEmail}>
                  更换邮箱
                </button>
                <button className="login-link" disabled={busy || countdown > 0} onClick={sendCode}>
                  {countdown > 0 ? `${countdown} 秒后可重发` : '重新发送验证码'}
                </button>
              </div>
            </>
          )}

          <div className="login-privacy">登录后仅保存昵称和头像资料；你的账目始终保存在本机。</div>
        </div>
      )}
    </div>
  );
}

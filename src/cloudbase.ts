import type Cloudbase from '@cloudbase/js-sdk';

// 云开发环境 ID：腾讯云 CloudBase 控制台 → 环境 → 环境概览里可复制，形如 pigbaby-1a2b3c4d
// 留空时 app 正常可用，登录相关入口提示「云端未配置」
export const CLOUDBASE_ENV = '';

export const isCloudConfigured = CLOUDBASE_ENV.trim().length > 0;

export interface CloudUser {
  uid: string;
  email: string;
  nickname: string;
}

interface SdkError {
  message?: string;
}

interface UserLike {
  id?: string;
  uid?: string;
  email?: string;
  nickname?: string;
  username?: string;
  user_metadata?: Record<string, unknown>;
}

type AuthRes<T> = { data?: T | null; error?: SdkError | null };

interface OtpData {
  user?: UserLike | null;
  verifyOtp?: (params: { token: string | number }) => Promise<unknown>;
}

export interface OtpTicket {
  verify: (code: string) => Promise<CloudUser>;
}

type CloudApp = ReturnType<typeof Cloudbase.init>;

let appPromise: Promise<CloudApp> | null = null;
let cached: CloudUser | null = null;

// SDK 体积较大，登录时才按需加载，不影响 app 启动
async function cloudApp(): Promise<CloudApp> {
  if (!appPromise) {
    appPromise = import('@cloudbase/js-sdk')
      .then((m) => m.default.init({ env: CLOUDBASE_ENV }))
      .catch((e) => {
        appPromise = null;
        throw e;
      });
  }
  return appPromise;
}

async function auth() {
  return (await cloudApp()).auth();
}

export function cachedCloudUser(): CloudUser | null {
  return cached;
}

export function errorText(e: unknown, fallback = '操作失败，请重试'): string {
  if (typeof e === 'string' && e.trim()) return e;
  if (e && typeof e === 'object') {
    const msg =
      (e as { message?: unknown }).message ??
      (e as { error?: { message?: unknown } }).error?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}

function defaultNickname(email: string): string {
  const cut = email.indexOf('@');
  return cut > 0 ? email.slice(0, cut) : email || 'PigBaby 用户';
}

function toCloudUser(raw: UserLike): CloudUser {
  const meta = (raw.user_metadata ?? {}) as Record<string, unknown>;
  const email = String(raw.email ?? '');
  const name = [meta.nickname, meta.name, meta.username, raw.nickname, raw.username].find(
    (v) => typeof v === 'string' && v.trim().length > 0,
  );
  return {
    uid: String(raw.id ?? raw.uid ?? ''),
    email,
    nickname: typeof name === 'string' ? name : defaultNickname(email),
  };
}

/** 读取本地登录态；未登录或未配置返回 null */
export async function loadCloudUser(): Promise<CloudUser | null> {
  if (!isCloudConfigured) return null;
  try {
    const a = await auth();
    const res = (await a.getSession()) as unknown as AuthRes<OtpData>;
    if (!res?.error && res?.data?.user) {
      cached = toCloudUser(res.data.user);
      return cached;
    }
    const local = a.hasLoginState() as unknown as { user?: UserLike } | null;
    cached = local?.user ? toCloudUser(local.user) : null;
    return cached;
  } catch {
    return null;
  }
}

/** 发送邮箱验证码；返回的 ticket 在用户输入验证码后调用 verify 完成登录/注册 */
export async function sendEmailCode(email: string): Promise<OtpTicket> {
  if (!isCloudConfigured) throw new Error('云端未配置，请先填入云开发环境 ID');
  const a = await auth();
  const res = (await a.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })) as unknown as AuthRes<OtpData>;
  if (res?.error) throw new Error(errorText(res.error, '验证码发送失败，请稍后重试'));
  const verifyOtp = res?.data?.verifyOtp;
  if (!verifyOtp) throw new Error('验证码已发出，但未能获取校验入口，请重试');
  return {
    verify: async (code: string) => {
      const r = (await verifyOtp({ token: code })) as unknown as AuthRes<OtpData>;
      if (r?.error) throw new Error(errorText(r.error, '验证码校验失败'));
      const user = r?.data?.user ? toCloudUser(r.data.user) : null;
      if (!user) throw new Error('登录成功但未取到用户信息，请重试');
      cached = user;
      return user;
    },
  };
}

export async function updateNickname(nickname: string): Promise<void> {
  if (!isCloudConfigured) throw new Error('云端未配置');
  const a = await auth();
  const res = (await a.updateUser({ nickname })) as unknown as AuthRes<unknown>;
  if (res?.error) throw new Error(errorText(res.error, '昵称保存失败'));
  await a.refreshUser().catch(() => undefined);
  if (cached) cached = { ...cached, nickname };
}

export async function signOutCloud(): Promise<void> {
  if (!isCloudConfigured) return;
  await (await auth()).signOut();
  cached = null;
}

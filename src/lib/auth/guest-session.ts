/**
 * 訪客 Session 簽名/驗證 - Node.js Runtime 專用
 * 使用 HMAC-SHA256 + AUTH_SECRET 簽名，防止 cookie 偽造
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { createGuestId } from './guest';

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  return secret;
}

/**
 * 對 guestId 進行 HMAC-SHA256 簽名
 * @returns `guestId.signature` 格式的簽名值
 */
export function signGuestCookie(guestId: string): string {
  const hmac = createHmac('sha256', getSecret());
  hmac.update(guestId);
  return `${guestId}.${hmac.digest('base64url')}`;
}

/**
 * 驗證簽名 cookie 並提取 guestId
 * @returns 驗證成功返回 guestId，失敗返回 null
 */
export function verifyGuestCookie(signedValue: string): string | null {
  const dotIndex = signedValue.lastIndexOf('.');
  if (dotIndex === -1) return null;

  const guestId = signedValue.substring(0, dotIndex);
  const signature = signedValue.substring(dotIndex + 1);

  const hmac = createHmac('sha256', getSecret());
  hmac.update(guestId);
  const expected = hmac.digest('base64url');

  // 固定時間比較，防止 timing attack
  try {
    const sigBuf = Buffer.from(signature, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }

  return guestId;
}

/**
 * 建立新的已簽名 guest cookie
 */
export function createSignedGuestCookie(): { guestId: string; signedValue: string } {
  const guestId = createGuestId();
  const signedValue = signGuestCookie(guestId);
  return { guestId, signedValue };
}

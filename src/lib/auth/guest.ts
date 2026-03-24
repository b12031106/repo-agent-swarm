/**
 * 訪客模式工具函數 - Edge Runtime 相容
 * middleware 會 import 此檔案，因此不能使用 Node.js crypto
 */

export const GUEST_COOKIE_NAME = 'guest-session';
export const GUEST_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
export const GUEST_CONVERSATION_TTL_HOURS = 24;
export const GUEST_QUERY_LIMIT = 20; // 訪客最大訊息數

// 訪客 ID 格式：guest_${uuid}
const GUEST_ID_PATTERN = /^guest_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 簽名 cookie 格式：guest_${uuid}.${base64url_signature}
const SIGNED_GUEST_COOKIE_PATTERN = /^guest_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]+$/i;

/**
 * 產生新的訪客 ID（使用全域 crypto，Edge 相容）
 */
export function createGuestId(): string {
  return `guest_${crypto.randomUUID()}`;
}

/**
 * 驗證是否為有效的訪客 ID 格式（不含簽名）
 */
export function isValidGuestId(id: string | null | undefined): id is string {
  if (!id || typeof id !== 'string') return false;
  return GUEST_ID_PATTERN.test(id);
}

/**
 * 驗證是否為有效的已簽名 guest cookie（供 middleware 格式檢查用）
 */
export function isValidSignedGuestCookie(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') return false;
  return SIGNED_GUEST_COOKIE_PATTERN.test(value);
}

/**
 * 從簽名 cookie 中提取 guestId（不驗證簽名）
 */
export function extractGuestIdFromCookie(signedValue: string): string {
  return signedValue.split('.')[0];
}

/**
 * 檢查 userId 是否為訪客（嚴格 regex 驗證）
 */
export function isGuestUserId(userId: string | null | undefined): boolean {
  if (!userId || typeof userId !== 'string') return false;
  return GUEST_ID_PATTERN.test(userId);
}

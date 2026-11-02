import type { Http } from '../api/http';

/** A device code to show the viewer (spec §7.1). Times are in seconds, as the server sends them. */
export interface DeviceCode {
  /** Secret: the app polls with it. Never shown or logged. */
  code: string;
  userCode: string;
  /** Where the viewer approves the code, e.g. "https://kino.watch/device". Also the QR code's content. */
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

/** A signed-in session's tokens. `expiresAt` is epoch milliseconds. */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface OAuthClient {
  id: string;
  secret: string;
}

export interface OAuth {
  requestDeviceCode(): Promise<DeviceCode>;
  /**
   * One poll. Resolves with tokens once the viewer approved the code. Otherwise throws an ApiError
   * whose `code` is the OAuth error, e.g. "authorization_pending" or "slow_down".
   */
  pollDeviceToken(code: string): Promise<Tokens>;
  /** Exchanges a refresh token for new tokens. The old refresh token stops working (it rotates). */
  refresh(refreshToken: string): Promise<Tokens>;
}

const DEFAULT_VERIFICATION_URI = 'https://kino.watch/device';
const DEFAULT_INTERVAL_S = 5;

interface DeviceCodeResponse {
  code: string;
  user_code: string;
  verification_uri?: string;
  expires_in: number | string;
  interval?: number | string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number | string;
}

/**
 * The kino.watch OAuth 2 endpoints. They live at the API host root, not under /v1, and take the client
 * credentials in the query string (research 10-kp-api §1).
 */
export function createOAuth(http: Http, client: OAuthClient, now: () => number = Date.now): OAuth {
  const credentials = { client_id: client.id, client_secret: client.secret };
  const toTokens = (res: TokenResponse): Tokens => ({
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresAt: now() + Number(res.expires_in) * 1000,
  });

  return {
    async requestDeviceCode() {
      const res = await http<DeviceCodeResponse>({
        method: 'POST',
        path: '/oauth2/device',
        query: { grant_type: 'device_code', ...credentials },
      });
      const interval = Number(res.interval); // may arrive as a string
      return {
        code: res.code,
        userCode: res.user_code,
        verificationUri: canonicalVerificationUri(res.verification_uri),
        expiresIn: Number(res.expires_in),
        interval: interval > 0 ? interval : DEFAULT_INTERVAL_S,
      };
    },

    async pollDeviceToken(code) {
      const res = await http<TokenResponse>({
        method: 'POST',
        path: '/oauth2/device',
        query: { grant_type: 'device_token', ...credentials, code },
      });
      return toTokens(res);
    },

    async refresh(refreshToken) {
      const res = await http<TokenResponse>({
        method: 'POST',
        path: '/oauth2/token',
        query: { grant_type: 'refresh_token', ...credentials, refresh_token: refreshToken },
      });
      return toTokens(res);
    },
  };
}

/** kino.pub was renamed kino.watch and no longer resolves, but the API may still name it. */
function canonicalVerificationUri(uri: string | undefined): string {
  if (!uri) return DEFAULT_VERIFICATION_URI;
  try {
    const url = new URL(uri);
    if (url.hostname === 'kino.pub' || url.hostname.endsWith('.kino.pub')) {
      url.hostname = url.hostname.replace(/kino\.pub$/, 'kino.watch');
    }
    return url.toString();
  } catch {
    return DEFAULT_VERIFICATION_URI;
  }
}

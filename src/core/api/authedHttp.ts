import { isApiError } from './errors';
import type { Http } from './http';

/** Where authenticated requests get their access token. Implemented by core/auth/session. */
export interface AccessTokenSource {
  /** The token to send now. Throws ApiError('auth') when there is no session. */
  accessToken(): Promise<string>;
  /**
   * The API rejected `token` with a 401. Resolves with a token worth retrying with (refreshing if
   * nobody has yet), or throws ApiError('auth') once the session has ended.
   */
  renewAfterRejection(token: string): Promise<string>;
  /** Ends the session because the API keeps rejecting it. */
  expire(): void;
}

/**
 * Adds the session's access token to every request, as the `access_token` query parameter. kino.watch
 * accepts a bearer header too, but its CORS rules don't allow `Authorization` from a browser origin.
 *
 * A 401 gets one refresh and one retry (spec §7.2). If the retry is rejected too, the session ends.
 */
export function withAuth(http: Http, tokens: AccessTokenSource): Http {
  return async <T>(req: Parameters<Http>[0]): Promise<T> => {
    const send = (token: string) => http<T>({ ...req, query: { ...req.query, access_token: token } });
    const token = await tokens.accessToken();
    try {
      return await send(token);
    } catch (error) {
      if (!isApiError(error, 'auth')) throw error;
    }
    const renewed = await tokens.renewAfterRejection(token);
    try {
      return await send(renewed);
    } catch (error) {
      if (isApiError(error, 'auth')) tokens.expire();
      throw error;
    }
  };
}

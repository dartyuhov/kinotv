import type { Http } from './http';

/** Where authenticated requests get their access token. Implemented by core/auth/session. */
export interface AccessTokenSource {
  /** The token to send now. Throws ApiError('auth') when there is no session. */
  accessToken(): Promise<string>;
}

/**
 * Adds the session's access token to every request, as the `access_token` query parameter. kino.watch
 * accepts a bearer header too, but its CORS rules don't allow `Authorization` from a browser origin.
 */
export function withAuth(http: Http, tokens: AccessTokenSource): Http {
  return async <T>(req: Parameters<Http>[0]): Promise<T> => {
    const token = await tokens.accessToken();
    return http<T>({ ...req, query: { ...req.query, access_token: token } });
  };
}

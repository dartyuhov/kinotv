// Response shapes of kino.watch API v1, as observed (research 10-kp-api §13). Fields the app doesn't use
// yet are left out; add them when a screen needs them. Some numbers arrive as strings: coerce with Number().

/** GET /v1/user → `user`. Account data: never log it. */
export interface User {
  username: string;
  /** Unix seconds. */
  reg_date: number;
  subscription: {
    active: boolean;
    /** Unix seconds. */
    end_time: number;
    /** Days left, fractional. */
    days: number;
  };
  profile: { name: string | null; avatar: string };
}

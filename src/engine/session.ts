export interface Session {
  cookieHeader: string;
  userAgent: string;
  mintedAt: number;
}

export interface Minter {
  mint(): Promise<Session>;
}

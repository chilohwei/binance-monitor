export interface NotifyMessage {
  title: string;
  body: string;
  group: string;
  url?: string;
  level?: "active" | "timeSensitive" | "passive" | "critical";
  sound?: string;
}

export interface Notifier {
  readonly name: string;
  send(message: NotifyMessage): Promise<void>;
}

export interface Monitor {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface AlphaTokenSnapshot {
  symbol: string;
  onlineAirdrop: boolean;
  onlineTge: boolean;
}

export interface AlphaTokenApiItem {
  alphaId: string;
  tokenId: string;
  symbol: string;
  name: string;
  chainId: string;
  contractAddress: string;
  listingTime: number;
  onlineAirdrop: boolean;
  onlineTge: boolean;
  price: string;
  marketCap: string;
  volume24h: string | null;
}

export interface AnnouncementData {
  catalogId: number;
  catalogName: string;
  publishDate: number;
  title: string;
  body: string;
  disclaimer: string;
  code?: string;
}

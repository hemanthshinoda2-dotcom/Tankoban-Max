export type AppSection =
  | 'shell'
  | 'library'
  | 'comic'
  | 'book'
  | 'audiobook'
  | 'video'
  | 'browser'
  | 'torrent';

export interface AppOpenFilesEventPayload {
  paths: string[];
  source: string;
}

export interface WindowSetFullscreenArgs {
  0: boolean;
}

export interface ScanRequest {
  force?: boolean;
}

export interface GenericOkResponse {
  ok: boolean;
}

declare global {
  interface Window {
    Tanko?: any;
    booksApp?: any;
    setMode?: (mode: string) => void;
  }
}

export {};

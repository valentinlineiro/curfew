export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

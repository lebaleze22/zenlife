export type QueryKey = string;

export interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

export class QueryCache {
  private cache = new Map<QueryKey, CacheEntry<unknown>>();

  get<T>(key: QueryKey): CacheEntry<T> | undefined {
    return this.cache.get(key) as CacheEntry<T> | undefined;
  }

  set<T>(key: QueryKey, data: T): void {
    this.cache.set(key, { data, updatedAt: Date.now() });
  }

  invalidate(keyPrefix?: QueryKey): void {
    if (!keyPrefix) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
      }
    }
  }
}

export const queryCache = new QueryCache();

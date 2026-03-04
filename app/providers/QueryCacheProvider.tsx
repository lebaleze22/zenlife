import React, { createContext, useContext, useMemo } from 'react';
import { QueryCache } from '../../data/query/cache';

const QueryCacheContext = createContext<QueryCache | null>(null);

export const QueryCacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cache = useMemo(() => new QueryCache(), []);
  return <QueryCacheContext.Provider value={cache}>{children}</QueryCacheContext.Provider>;
};

export const useQueryCache = (): QueryCache => {
  const context = useContext(QueryCacheContext);
  if (!context) {
    throw new Error('useQueryCache must be used within QueryCacheProvider');
  }
  return context;
};


import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QueryCacheProvider } from './app/providers/QueryCacheProvider';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryCacheProvider>
      <App />
    </QueryCacheProvider>
  </React.StrictMode>
);

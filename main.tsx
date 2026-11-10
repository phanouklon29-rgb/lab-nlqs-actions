import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { RefDataProvider } from './lib/refdata';
import { ToastProvider } from './components/ui';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RefDataProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </RefDataProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

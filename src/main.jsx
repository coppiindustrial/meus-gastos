import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import { iniciarTema } from './lib/tema.js';
import '@fontsource-variable/inter';
// O CSS do grid da Visão geral ANTES do index.css: assim os overrides de lá (.react-grid-item,
// .react-resizable-handle) vencem sem precisar de !important.
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './index.css';

// O tema ANTES do primeiro render: quem usa o escuro não pode ver a tela clara piscar.
iniciarTema();

// `basename`: no GitHub Pages o app mora em /meus-gastos/ (o BASE_URL do Vite, sem a barra final).
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);

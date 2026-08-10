import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

/* Estilos entram pelo bundle (o Vite extrai um CSS único no build), e não por <link> no
   HTML: assim as fontes auto-hospedadas e o CSS ficam versionados junto com o JS. */
import './styles/fonts.css';
import './styles/style.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

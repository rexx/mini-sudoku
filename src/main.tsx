import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// autoUpdate: the new worker takes over on the next launch, so there is no
// update prompt to handle here.
registerSW({immediate: true});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The dark skeleton in index.html covers the gap between first paint and mount.
document.getElementById('boot-shell')?.remove();

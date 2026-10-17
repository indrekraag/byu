import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/doto/700.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/permanent-marker/400.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

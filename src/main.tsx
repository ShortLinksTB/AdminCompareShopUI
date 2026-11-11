import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';

const studioFonts = document.createElement('link');
studioFonts.rel = 'stylesheet';
studioFonts.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap';
studioFonts.media = 'print';
studioFonts.addEventListener('load', () => { studioFonts.media = 'all'; }, { once: true });
document.head.append(studioFonts);

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);

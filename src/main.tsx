import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AdminIdentityContext } from './permissions';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><AdminIdentityContext.Provider value={window.__GIATOT_ADMIN_IDENTITY__ ?? null}><BrowserRouter><App /></BrowserRouter></AdminIdentityContext.Provider></StrictMode>);

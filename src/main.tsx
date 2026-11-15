import { initFrontendTelemetry } from './telemetry/index.ts';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

initFrontendTelemetry();

createRoot(document.getElementById('root')!).render(<App />);

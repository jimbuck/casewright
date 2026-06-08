import { createRoot } from 'react-dom/client';

import '@casewright/brand/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';

import { App } from '@/components/App';

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');

createRoot(container).render(<App />);

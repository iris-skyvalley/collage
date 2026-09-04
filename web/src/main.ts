import './styles.css';
import { App } from './ui/app.ts';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app');
void new App().mount(root);

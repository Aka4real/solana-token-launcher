import { Buffer } from 'buffer';

window.Buffer = Buffer;
window.process = { env: {} };
window.global = window;

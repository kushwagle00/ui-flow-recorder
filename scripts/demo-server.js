import http from 'node:http';
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../demo/index.html', import.meta.url));
http.createServer((req,res) => { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(html); }).listen(4173,'127.0.0.1',() => console.log('Demo: http://127.0.0.1:4173 (Ctrl+C to stop)'));

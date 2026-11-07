/* 测试用 Mock LLM：OpenAI 兼容 /v1/chat/completions，支持流式 SSE 与非流式 */
'use strict';
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 9990);

http.createServer((req, res) => {
        if (req.method !== 'POST' || !req.url.includes('/chat/completions')) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'not found' }));
        }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            let parsed = {};
            try { parsed = JSON.parse(body || '{}'); } catch { /* ignore */ }
            const auth = req.headers.authorization || '';
            if (auth !== 'Bearer test-key') {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: { message: 'bad key' } }));
            }
            const reply = '（她抬起头，炉火在她眼里跳动。）「你终于来了，' + (parsed.model || 'mock') + ' 的客人。今夜想听什么故事？」';
            if (parsed.stream === false || parsed.max_tokens === 1) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ id: 'mock', choices: [{ index: 0, message: { role: 'assistant', content: parsed.max_tokens === 1 ? '好' : reply }, finish_reason: 'stop' }] }));
            }
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            const parts = ['（她抬起头，', '炉火在她眼里跳动。）', '「你终于来了，', '今夜想听什么故事？」'];
            let i = 0;
            const t = setInterval(() => {
                if (i < parts.length) {
                    res.write('data: ' + JSON.stringify({ id: 'mock', choices: [{ index: 0, delta: { content: parts[i++] } }] }) + '\n\n');
                } else {
                    res.write('data: [DONE]\n\n');
                    clearInterval(t);
                    res.end();
                }
            }, 30);
        });
    }).listen(PORT, () => console.log('[mock-llm] listening :' + PORT));

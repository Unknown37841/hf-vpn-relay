// server.js for Hugging Face Spaces & Node.js Edge Relay
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 7860;

const DE_RENDER_SERVERS = [
    'morli43.onrender.com',
    'shrtali.onrender.com',
    'sopli7.onrender.com',
    'nolir4.onrender.com',
    'web-r4.onrender.com',
    'webinar-0hy2.onrender.com',
    'web-dq.onrender.com',
    'qiol.onrender.com',
    'voief4.onrender.com',
    'tolp3ws.onrender.com'
];

const US_RENDER_SERVERS = [
    'web-dashboarder.onrender.com',
    'web-dashboardor.onrender.com',
    'web-dashboard-dopl.onrender.com'
];

const SG_RENDER_SERVERS = [
    'web-dashboardiir.onrender.com'
];

const RENDER_UUID = 'bfbf6002-67a6-4a57-8076-ddfefa27ee63';

// Failover tracking
const serverFailures = new Map();

function getActiveServer(serverList) {
    const now = Date.now();
    const active = serverList.filter(s => (now - (serverFailures.get(s) || 0)) > 120000);
    const pool = active.length > 0 ? active : serverList;
    return pool[Math.floor(Math.random() * pool.length)];
}

// Keepalive every 8 minutes
setInterval(() => {
    const all = [...DE_RENDER_SERVERS, ...US_RENDER_SERVERS, ...SG_RENDER_SERVERS];
    all.forEach(h => {
        http.get(`http://${h}/`, () => {}).on('error', () => {});
    });
}, 8 * 60 * 1000);

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const host = req.headers.host;

    // 1. Wake endpoint
    if (url.pathname === '/wake') {
        const all = [
            ...DE_RENDER_SERVERS.map(h => ({ host: h, country: 'DE' })),
            ...US_RENDER_SERVERS.map(h => ({ host: h, country: 'US' })),
            ...SG_RENDER_SERVERS.map(h => ({ host: h, country: 'SG' }))
        ];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'Waking Render servers...', total: all.length }, null, 2));
        return;
    }

    // 2. Subscription endpoint
    if (url.pathname === '/sub') {
        const country = (url.searchParams.get('country') || '').toUpperCase();
        const configs = [];

        const addConfig = (path, name) => {
            configs.push(`vless://${RENDER_UUID}@${host}:443?security=tls&type=ws&sni=${host}&host=${host}&path=${encodeURIComponent(path)}#${encodeURIComponent(name)}`);
        };

        if (!country || country === 'DE') {
            for (let i = 1; i <= 5; i++) {
                addConfig('/ws/de', `🇩🇪 Germany #${String(i).padStart(2, '0')} (HF Edge)`);
            }
        }
        if (!country || country === 'US') {
            for (let i = 1; i <= 3; i++) {
                addConfig('/ws/us', `🇺🇸 United States #${String(i).padStart(2, '0')} (HF Edge)`);
            }
        }
        if (!country || country === 'SG') {
            addConfig('/ws/sg', `🇸🇬 Singapore #01 (HF Edge)`);
        }

        const b64 = Buffer.from(configs.join('\n')).toString('base64');
        res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Subscription-Userinfo': 'upload=0; download=0; total=107374182400; expire=0'
        });
        res.end(b64);
        return;
    }

    // 3. Web Dashboard
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8"><title>Hugging Face Edge Relay</title>
<style>
body { font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; display: flex; justify-content: center; }
.card { background: #1e293b; border-radius: 12px; padding: 24px; max-width: 600px; width: 100%; border: 1px solid #334155; }
h1 { color: #38bdf8; font-size: 20px; }
.box { background: #0f172a; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #a5f3fc; word-break: break-all; margin: 10px 0; direction: ltr; text-align: left; }
.btn { display: inline-block; background: #0284c7; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 8px; }
</style>
</head>
<body>
<div class="card">
    <h1>🚀 تونل Hugging Face AWS Edge (پایداری ۱۰۰٪)</h1>
    <p>ترافیک شما مستقیماً از شبکه جهانی سرورهای آمازون بدون نیاز به آی‌پی تمیز عبور کرده و به ۱۰ سرور اختصاصی آلمان متصل می‌شود.</p>
    <h3>لینک سابسکریپشن:</h3>
    <div class="box">https://${host}/sub</div>
    <a href="/sub" class="btn">دریافت ساب مستقیم</a>
</div>
</body>
</html>`);
});

// WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', (clientWs, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pool = DE_RENDER_SERVERS;
    if (url.pathname.includes('/us')) pool = US_RENDER_SERVERS;
    else if (url.pathname.includes('/sg')) pool = SG_RENDER_SERVERS;

    const targetHost = getActiveServer(pool);
    const targetUrl = `wss://${targetHost}/ws/${RENDER_UUID}`;

    const renderWs = new WebSocket(targetUrl);
    const earlyQueue = [];

    clientWs.on('message', (data) => {
        if (renderWs.readyState === WebSocket.OPEN) {
            renderWs.send(data);
        } else {
            earlyQueue.push(data);
        }
    });

    renderWs.on('open', () => {
        while (earlyQueue.length > 0) {
            renderWs.send(earlyQueue.shift());
        }
    });

    renderWs.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data);
        }
    });

    const cleanup = () => {
        try { renderWs.close(); } catch (_) {}
        try { clientWs.close(); } catch (_) {}
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);
    renderWs.on('close', cleanup);
    renderWs.on('error', () => {
        serverFailures.set(targetHost, Date.now());
        cleanup();
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

// StockPulse India — Cloud/Local Proxy Server
// Local:  node server.js  → open http://localhost:3000
// Cloud:  Deploy to Render.com free tier (see HOW_TO_DEPLOY.txt)

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;

const RSS_FEEDS = [
  { id:'mc',   name:'MoneyControl',      color:'#e65c00', initials:'MC',
    url:'https://www.moneycontrol.com/rss/marketreports.xml' },
  { id:'mc2',  name:'MC Technicals',     color:'#e65c00', initials:'M2',
    url:'https://www.moneycontrol.com/rss/technicals.xml' },
  { id:'et',   name:'ET Markets',         color:'#ff6600', initials:'ET',
    url:'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { id:'et2',  name:'ET Stocks',          color:'#ff6600', initials:'E2',
    url:'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms' },
  { id:'zee',  name:'Zee Business',       color:'#7b2fff', initials:'ZB',
    url:'https://www.zeebiz.com/rss' },
  { id:'bs',   name:'Business Standard',  color:'#cc0000', initials:'BS',
    url:'https://www.business-standard.com/rss/markets-106.rss' },
  { id:'lm',   name:'LiveMint',           color:'#0080ff', initials:'LM',
    url:'https://www.livemint.com/rss/markets' },
  { id:'ndtv', name:'NDTV Profit',        color:'#e00000', initials:'NP',
    url:'https://feeds.feedburner.com/ndtvprofit-latest' },
];

function fetchUrl(targetUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'));
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      timeout: 12000,
    };
    const req = https.get(targetUrl, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Simple in-memory cache — 10 min TTL so mobile doesn't re-fetch on every open
const cache = { data: null, ts: 0, TTL: 10 * 60 * 1000 };

async function getAllFeeds() {
  if (cache.data && (Date.now() - cache.ts) < cache.TTL) {
    console.log('Returning cached feeds');
    return cache.data;
  }
  console.log('Fetching fresh RSS feeds...');
  const results = [];
  for (const feed of RSS_FEEDS) {
    console.log(`  ${feed.name}...`);
    try {
      const { status, body } = await fetchUrl(feed.url);
      console.log(`  ${feed.name}: ${status}, ${body.length} bytes`);
      results.push({ id: feed.id, name: feed.name, color: feed.color, initials: feed.initials, status, xml: body });
    } catch(e) {
      console.log(`  ${feed.name}: ERROR ${e.message}`);
      results.push({ id: feed.id, name: feed.name, color: feed.color, initials: feed.initials, status: 0, xml: '', error: e.message });
    }
  }
  cache.data = results;
  cache.ts = Date.now();
  return results;
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // CORS — allow any origin so mobile browsers work
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // Serve the HTML app
  if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
    const htmlPath = path.join(__dirname, 'stock-reco-free.html');
    try {
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch(e) {
      res.writeHead(500);
      res.end('stock-reco-free.html not found in same folder as server.js');
    }
    return;
  }

  // RSS feed API
  if (parsed.pathname === '/api/feeds') {
    try {
      const data = await getAllFeeds();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch(e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Health check — Render.com needs this
  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ts: Date.now() }));
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║      StockPulse India — Server Running       ║');
  console.log(`║      http://localhost:${PORT}                    ║`);
  console.log('╚══════════════════════════════════════════════╝');
});

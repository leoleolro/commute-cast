// The local podcast host.
//
// Serves the feed, the audio, and a phone-sized web player. The feed is
// generated per request from the Host header, so whichever address you reach
// it on — mac.local, a LAN IP, localhost — the episode URLs inside it match.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { networkInterfaces, hostname } from 'node:os';
import { loadConfig, loadEpisodes, EPISODES_DIR, ART_DIR, ROOT } from './store.js';
import { buildFeed, hhmmss } from './feed.js';
import { coverPng } from './cover.js';

export function lanAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const net of entries || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

export const bonjourName = () => `${hostname().replace(/\.local$/, '')}.local`;

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-cache', ...headers });
  res.end(body);
}

/** Stream a file, honouring Range requests so seeking and scrubbing work. */
async function sendFile(req, res, file, type) {
  let info;
  try {
    info = await stat(file);
  } catch {
    return send(res, 404, 'not found');
  }

  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : info.size - 1;
    if (start >= info.size || start > end) {
      return send(res, 416, '', { 'Content-Range': `bytes */${info.size}` });
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${info.size}`,
      'Accept-Ranges': 'bytes',
    });
    return createReadStream(file, { start, end }).pipe(res);
  }

  res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Accept-Ranges': 'bytes' });
  createReadStream(file).pipe(res);
}

function playerPage(config, episodes, base) {
  const shows = [...new Set(episodes.map((e) => e.show))];
  const feedUrl = `${base}/feed.xml`;
  const rows = episodes.map((e) => `
    <li class="ep" data-show="${e.show}">
      <button class="play" data-src="/audio/${e.file}" data-title="${e.title.replace(/"/g, '&quot;')}" aria-label="Play">▶</button>
      <div class="meta">
        <h3>${e.title}</h3>
        <p>${config.shows[e.show]?.title || e.show} · ${hhmmss(e.duration)} · ${new Date(e.pubDate).toLocaleDateString()}</p>
      </div>
      <a class="dl" href="/audio/${e.file}" download title="Save for offline">⤓</a>
    </li>`).join('');

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#15101c">
<title>${config.title}</title>
<style>
  :root{--bg:#15101c;--card:#221a2e;--line:#33283f;--fg:#f2edf7;--dim:#a294b5;--accent:#e05fc4}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;
       padding:max(16px,env(safe-area-inset-top)) 16px calc(120px + env(safe-area-inset-bottom))}
  header{display:flex;gap:14px;align-items:center;margin-bottom:20px}
  header img{width:64px;height:64px;border-radius:12px}
  h1{font-size:20px;margin:0}
  header p{margin:2px 0 0;color:var(--dim);font-size:13px}
  .subscribe{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:18px;font-size:13px;color:var(--dim)}
  .subscribe code{display:block;color:var(--fg);font-size:12px;word-break:break-all;margin-top:6px;user-select:all}
  .filters{display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;margin-bottom:6px;scrollbar-width:none}
  .filters::-webkit-scrollbar{display:none}
  .filters button{white-space:nowrap;background:var(--card);color:var(--dim);border:1px solid var(--line);
                  border-radius:999px;padding:7px 14px;font-size:13px;cursor:pointer}
  .filters button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
  ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
  .ep{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}
  .ep[hidden]{display:none}
  .play{flex:none;width:42px;height:42px;border-radius:50%;border:none;background:var(--accent);color:#fff;font-size:15px;cursor:pointer}
  .play.playing{background:var(--line);color:var(--fg)}
  .meta{flex:1;min-width:0}
  .meta h3{margin:0;font-size:15px;font-weight:600}
  .meta p{margin:2px 0 0;color:var(--dim);font-size:12px}
  .dl{flex:none;color:var(--dim);text-decoration:none;font-size:20px;padding:0 4px}
  .empty{color:var(--dim);text-align:center;padding:40px 0}
  #bar{position:fixed;left:0;right:0;bottom:0;background:rgba(28,21,38,.96);backdrop-filter:blur(12px);
       border-top:1px solid var(--line);padding:10px 16px calc(10px + env(safe-area-inset-bottom));transform:translateY(120%);transition:transform .22s}
  #bar.up{transform:none}
  #now{font-size:13px;margin:0 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  audio{width:100%;height:36px}
</style></head><body>
<header>
  <img src="/art/commute-cast.png" alt="">
  <div><h1>${config.title}</h1><p>${episodes.length} episode${episodes.length === 1 ? '' : 's'} · ${config.author}</p></div>
</header>
<div class="subscribe">Subscribe in a podcast app that fetches feeds on-device:<code>${feedUrl}</code></div>
<div class="filters">
  <button data-f="all" aria-pressed="true">All</button>
  ${shows.map((s) => `<button data-f="${s}" aria-pressed="false">${config.shows[s]?.title || s}</button>`).join('')}
</div>
<ul id="list">${rows}</ul>
${episodes.length ? '' : '<p class="empty">No episodes yet. Run <code>pod korean</code> or <code>pod claude</code> on your Mac.</p>'}
<div id="bar"><p id="now"></p><audio id="audio" controls preload="none"></audio></div>
<script>
  const audio = document.getElementById('audio'), bar = document.getElementById('bar'), now = document.getElementById('now');
  let active = null;
  document.querySelectorAll('.play').forEach((btn) => btn.addEventListener('click', () => {
    if (active === btn && !audio.paused) { audio.pause(); return; }
    if (active !== btn) {
      if (active) active.classList.remove('playing');
      active = btn; btn.classList.add('playing');
      audio.src = btn.dataset.src; now.textContent = btn.dataset.title; bar.classList.add('up');
      // Lock-screen controls and AirPods buttons while the screen is off.
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({
        title: btn.dataset.title, artist: ${JSON.stringify(config.author)},
        artwork: [{ src: '/art/commute-cast.png', sizes: '1400x1400', type: 'image/png' }],
      });
    }
    audio.play();
  }));
  audio.addEventListener('pause', () => active && active.classList.remove('playing'));
  audio.addEventListener('play', () => active && active.classList.add('playing'));
  // Roll straight into the next episode so a commute needs one tap.
  audio.addEventListener('ended', () => {
    const buttons = [...document.querySelectorAll('.ep:not([hidden]) .play')];
    const next = buttons[buttons.indexOf(active) + 1];
    if (next) next.click();
  });
  document.querySelectorAll('.filters button').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.filters button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    document.querySelectorAll('.ep').forEach((ep) => {
      ep.hidden = btn.dataset.f !== 'all' && ep.dataset.show !== btn.dataset.f;
    });
  }));
</script></body></html>`;
}

export async function serve({ port } = {}) {
  const config = await loadConfig();
  const listenPort = port || config.port || 4000;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const base = `http://${req.headers.host || `localhost:${listenPort}`}`;
      const episodes = await loadEpisodes();
      const name = decodeURIComponent(url.pathname);

      if (name === '/' || name === '/index.html') {
        return send(res, 200, playerPage(config, episodes, base), { 'Content-Type': 'text/html; charset=utf-8' });
      }
      if (name === '/feed.xml') {
        return send(res, 200, buildFeed({ config, episodes, base }), { 'Content-Type': 'application/rss+xml; charset=utf-8' });
      }
      const showFeed = name.match(/^\/feed\/([\w-]+)\.xml$/);
      if (showFeed) {
        if (!config.shows[showFeed[1]]) return send(res, 404, 'unknown show');
        return send(res, 200, buildFeed({ config, episodes, base, show: showFeed[1] }),
          { 'Content-Type': 'application/rss+xml; charset=utf-8' });
      }
      if (name === '/api/episodes') {
        return send(res, 200, JSON.stringify(episodes), { 'Content-Type': 'application/json' });
      }

      const audio = name.match(/^\/audio\/([\w.-]+\.m4a)$/);
      if (audio) return sendFile(req, res, path.join(EPISODES_DIR, audio[1]), 'audio/x-m4a');

      const art = name.match(/^\/art\/([\w-]+)\.png$/);
      if (art) {
        const file = path.join(ART_DIR, `${art[1]}.png`);
        try {
          await stat(file);
        } catch {
          // Draw a cover on demand for any show that has never been rendered.
          return send(res, 200, coverPng(art[1]), { 'Content-Type': 'image/png' });
        }
        return sendFile(req, res, file, 'image/png');
      }

      send(res, 404, 'not found');
    } catch (err) {
      send(res, 500, `error: ${err.message}`);
    }
  });

  await new Promise((resolve) => server.listen(listenPort, '0.0.0.0', resolve));
  return { port: listenPort, lan: lanAddress(), bonjour: bonjourName(), server };
}

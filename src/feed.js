// RSS 2.0 with the iTunes extensions — the format every podcast app speaks.
//
// The feed is built per request rather than written to disk, so the enclosure
// URLs always match whatever address you actually subscribed with. That's what
// makes this survive your Mac changing IP on the wifi.

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPE[c]);
const cdata = (s) => `<![CDATA[${String(s ?? '').replace(/]]>/g, ']]&gt;')}]]>`;

function hhmmss(seconds) {
  const total = Math.round(seconds || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * @param {object} opts
 * @param {string} opts.base    absolute origin, e.g. http://mac.local:4000
 * @param {string} [opts.show]  restrict to one show; omit for the combined feed
 */
export function buildFeed({ config, episodes, base, show }) {
  const meta = show ? config.shows[show] : null;
  const title = meta ? `${config.title}: ${meta.title}` : config.title;
  const description = meta?.description || config.description;
  const art = `${base}/art/${show || 'commute-cast'}.png`;
  const items = (show ? episodes.filter((e) => e.show === show) : episodes);

  const entries = items.map((e) => `
    <item>
      <title>${xml(e.title)}</title>
      <description>${cdata(e.description)}</description>
      <itunes:summary>${cdata(e.description)}</itunes:summary>
      <pubDate>${new Date(e.pubDate).toUTCString()}</pubDate>
      <guid isPermaLink="false">${xml(e.id)}</guid>
      <enclosure url="${xml(`${base}/audio/${e.file}`)}" length="${e.bytes}" type="audio/x-m4a"/>
      <itunes:duration>${hhmmss(e.duration)}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
      <itunes:image href="${xml(`${base}/art/${e.show}.png`)}"/>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xml(title)}</title>
    <link>${xml(base)}</link>
    <description>${cdata(description)}</description>
    <language>${xml(config.language || 'en-us')}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <itunes:author>${xml(config.author)}</itunes:author>
    <itunes:summary>${cdata(description)}</itunes:summary>
    <itunes:owner><itunes:name>${xml(config.author)}</itunes:name></itunes:owner>
    <itunes:image href="${xml(art)}"/>
    <itunes:category text="Education"/>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:block>Yes</itunes:block>${entries}
  </channel>
</rss>
`;
}

export { hhmmss };

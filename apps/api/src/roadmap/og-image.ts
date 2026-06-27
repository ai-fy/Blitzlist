/**
 * Dynamic Open Graph image for /r/<code> — a 1200×630 branded card so the
 * shared link shows a rich preview on WhatsApp / iMessage / Slack instead of a
 * blank thumbnail.
 *
 * Rendered with workers-og (satori → SVG → PNG via resvg-wasm). The font is
 * fetched from Google Fonts at request time, subset to just the glyphs we draw
 * (small + fast). Scrapers fetch this once and cache it.
 */

import { ImageResponse, loadGoogleFont } from 'workers-og';

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function renderOgImage(opts: {
	name: string;
	workspaceName: string;
	total: number;
	done: number;
	pct: number;
}): Promise<Response> {
	const { name, workspaceName, total, done, pct } = opts;
	const stats = total === 0 ? 'Empty list' : `${total} item${total === 1 ? '' : 's'} · ${done} done · ${pct}%`;
	const title = name.length > 64 ? name.slice(0, 63) + '…' : name;

	const html = `
		<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:#08090a;padding:80px;font-family:Inter;">
			<div style="display:flex;align-items:center;color:#a78bfa;font-size:32px;font-weight:700;letter-spacing:2px;">BLITZLIST</div>
			<div style="display:flex;flex:1;flex-direction:column;justify-content:center;">
				<div style="display:flex;color:#7a7b82;font-size:30px;margin-bottom:18px;">${esc(workspaceName)}</div>
				<div style="display:flex;color:#e6e6e8;font-size:80px;font-weight:700;line-height:1.05;">${esc(title)}</div>
				<div style="display:flex;color:#b4b4bc;font-size:36px;margin-top:32px;">${esc(stats)}</div>
			</div>
			<div style="display:flex;width:1040px;height:16px;background:#16181c;border-radius:8px;">
				<div style="display:flex;width:${Math.max(0, Math.min(100, pct))}%;height:16px;background:#4cb782;border-radius:8px;"></div>
			</div>
		</div>`;

	// No `text` subsetting — it dropped punctuation glyphs (em dash, middle
	// dot). The full Latin subset covers punctuation + accents/umlauts, which
	// matters since list names are arbitrary user text.
	const [bold, regular] = await Promise.all([
		loadGoogleFont({ family: 'Inter', weight: 700 }),
		loadGoogleFont({ family: 'Inter', weight: 400 }),
	]);

	const img = new ImageResponse(html, {
		width: 1200,
		height: 630,
		fonts: [
			{ name: 'Inter', data: bold, weight: 700, style: 'normal' },
			{ name: 'Inter', data: regular, weight: 400, style: 'normal' },
		],
	});
	return new Response(img.body, {
		headers: {
			'content-type': 'image/png',
			'cache-control': 'public, max-age=600',
		},
	});
}

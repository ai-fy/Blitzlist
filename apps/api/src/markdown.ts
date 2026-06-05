/**
 * Markdown → safe HTML for /r/:code description fields.
 *
 * We don't have DOMPurify in Workers (no DOM), so the approach is:
 *   1. marked() in synchronous mode renders CommonMark + GFM.
 *   2. A small allowlist sanitizer strips dangerous tags/attrs after.
 *
 * Content is authored by share-code holders (edit-permission required for
 * item.body; comment-permission for comments) — i.e. semi-trusted, not
 * arbitrary internet. The sanitizer is defense in depth, not the only line.
 *
 * What's allowed:
 *   - Inline: <strong> <em> <code> <a> <br> <s> <del>
 *   - Block:  <p> <ul> <ol> <li> <h1>–<h6> <blockquote> <pre> <hr> <img>
 * What's stripped:
 *   - Any tag not in the allowlist (including <script>, <style>, <iframe>,
 *     <object>, <embed>, <link>, <meta>, <form>, <input>, <button>, <svg>).
 *   - All on* attributes (onclick, onerror, …).
 *   - href / src starting with `javascript:`, `vbscript:`, or `data:` other
 *     than `data:image/*`.
 *
 * We don't strip CSS in style="" attributes; we just disallow the attribute
 * entirely (no inline styles).
 */

import { marked } from 'marked';

// Configure marked once at module load.
marked.setOptions({
	gfm: true,
	breaks: true, // single newline → <br> (matches "write a paragraph, hit enter, expect break")
});

const ALLOWED_TAGS = new Set([
	'p',
	'br',
	'strong',
	'em',
	'b',
	'i',
	'u',
	's',
	'del',
	'code',
	'pre',
	'blockquote',
	'a',
	'ul',
	'ol',
	'li',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'img',
]);

const ALLOWED_ATTRS_BY_TAG: Record<string, Set<string>> = {
	a: new Set(['href', 'title', 'rel', 'target']),
	img: new Set(['src', 'alt', 'title']),
	code: new Set(['class']),
	pre: new Set(['class']),
};

/**
 * Render markdown to a safe HTML fragment.
 * Returns '' for empty input.
 */
export function renderMarkdown(text: string | null | undefined): string {
	if (!text || text.trim().length === 0) return '';
	const rawHtml = marked.parse(text, { async: false }) as string;
	return sanitize(rawHtml);
}

/**
 * Render markdown as a single-line preview: block tags flattened to text
 * (so `# Header` becomes plain "Header", `- item` becomes "item"), inline
 * formatting preserved (<strong>, <em>, <code>, <a>), whitespace collapsed,
 * truncated to `maxChars` *visible* characters with an ellipsis if cut.
 *
 * Used by the table view's description column, where the raw markdown
 * syntax (`#`, `**`, `[](...)`) was leaking through as literal text.
 */
export function renderInlinePreview(text: string | null | undefined, maxChars: number): string {
	if (!text || text.trim().length === 0) return '';
	const html = renderMarkdown(text);
	// Drop block-level tags entirely; keep inline (a/strong/em/code/s/del/u/b/i).
	// Replace with a space so adjacent words don't fuse.
	const stripped = html
		.replace(/<\/?(h[1-6]|p|ul|ol|li|blockquote|pre|hr|img)\b[^>]*>/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return truncateHtmlByVisible(stripped, maxChars);
}

/**
 * Truncate an HTML fragment by *visible* character count (ignoring tag
 * syntax and treating each HTML entity as one char). Closes any open
 * inline tags at the cut point so the output stays well-formed.
 */
function truncateHtmlByVisible(html: string, maxChars: number): string {
	let visible = 0;
	let i = 0;
	let out = '';
	const open: string[] = [];
	while (i < html.length) {
		const c = html[i];
		if (c === '<') {
			const gt = html.indexOf('>', i);
			if (gt === -1) break;
			const tag = html.slice(i, gt + 1);
			out += tag;
			const m = /^<(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(tag);
			if (m && m[2]) {
				const isClose = m[1] === '/';
				const name = m[2].toLowerCase();
				if (isClose) {
					const idx = open.lastIndexOf(name);
					if (idx >= 0) open.splice(idx, 1);
				} else if (!tag.endsWith('/>') && !['br', 'hr', 'img'].includes(name)) {
					open.push(name);
				}
			}
			i = gt + 1;
			continue;
		}
		if (c === '&') {
			const semi = html.indexOf(';', i);
			if (semi !== -1 && semi - i < 10) {
				out += html.slice(i, semi + 1);
				visible++;
				i = semi + 1;
				if (visible >= maxChars) return finish(out, open);
				continue;
			}
		}
		out += c;
		visible++;
		i++;
		if (visible >= maxChars) return finish(out, open);
	}
	return out;
}

function finish(out: string, open: string[]): string {
	let result = out + '…';
	while (open.length > 0) result += `</${open.pop()}>`;
	return result;
}

/**
 * Tag-level allowlist sanitizer. Walks the HTML in one pass with a simple
 * tokenizer (no DOM). For each tag we keep it if allowed, strip it if not,
 * filter its attributes against the per-tag allowlist, and rewrite dangerous
 * URLs to '#'.
 *
 * This is deliberately conservative: anything we don't recognize gets dropped.
 */
function sanitize(html: string): string {
	const out: string[] = [];
	let i = 0;
	while (i < html.length) {
		const lt = html.indexOf('<', i);
		if (lt === -1) {
			out.push(html.slice(i));
			break;
		}
		// emit text up to '<'
		if (lt > i) out.push(html.slice(i, lt));
		// find end of tag
		const gt = html.indexOf('>', lt);
		if (gt === -1) {
			// malformed — drop the rest
			break;
		}
		const tagSrc = html.slice(lt, gt + 1);
		const sanitized = sanitizeTag(tagSrc);
		if (sanitized) out.push(sanitized);
		i = gt + 1;
	}
	return out.join('');
}

function sanitizeTag(tagSrc: string): string | null {
	// Comment / CDATA / doctype — drop.
	if (tagSrc.startsWith('<!') || tagSrc.startsWith('<?')) return null;

	const isClose = tagSrc.startsWith('</');
	const inner = tagSrc.slice(isClose ? 2 : 1, -1).trim();
	// self-closing slash is fine; we'll re-emit normalized
	const selfClosing = inner.endsWith('/');
	const body = selfClosing ? inner.slice(0, -1).trim() : inner;
	const spaceIdx = body.search(/\s/);
	const tagName = (spaceIdx === -1 ? body : body.slice(0, spaceIdx)).toLowerCase();
	if (!ALLOWED_TAGS.has(tagName)) return null;
	if (isClose) return `</${tagName}>`;

	const attrStr = spaceIdx === -1 ? '' : body.slice(spaceIdx + 1);
	const attrs = parseAttrs(attrStr);
	const allowedAttrSet = ALLOWED_ATTRS_BY_TAG[tagName];
	const kept: string[] = [];
	for (const [name, valueRaw] of attrs) {
		const lname = name.toLowerCase();
		// always drop on*=
		if (lname.startsWith('on')) continue;
		if (!allowedAttrSet || !allowedAttrSet.has(lname)) continue;
		let value = valueRaw;
		if (lname === 'href' || lname === 'src') {
			value = sanitizeUrl(value, lname);
		}
		// re-emit; quote with double-quotes and escape embedded ones
		const safe = value.replace(/"/g, '&quot;');
		kept.push(`${lname}="${safe}"`);
	}
	// Force rel="noopener noreferrer" on links that target a new tab, and add
	// target="_blank" to all rendered anchor tags so descriptions don't navigate
	// away from the roadmap.
	if (tagName === 'a') {
		const hasHref = kept.some((a) => a.startsWith('href='));
		if (hasHref) {
			if (!kept.some((a) => a.startsWith('target='))) kept.push('target="_blank"');
			if (!kept.some((a) => a.startsWith('rel='))) kept.push('rel="noopener noreferrer"');
		}
	}
	// Images: force loading=lazy.
	if (tagName === 'img') {
		kept.push('loading="lazy"');
		kept.push('decoding="async"');
	}
	const attrPart = kept.length > 0 ? ' ' + kept.join(' ') : '';
	const close = selfClosing || tagName === 'br' || tagName === 'hr' || tagName === 'img' ? ' /' : '';
	return `<${tagName}${attrPart}${close}>`;
}

/**
 * Minimal attribute parser. Handles `name="value"`, `name='value'`, and
 * `name=value`. Doesn't try to be perfect — just good enough for sanitized
 * marked output.
 */
function parseAttrs(src: string): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	const rx = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
	let m: RegExpExecArray | null;
	while ((m = rx.exec(src)) !== null) {
		const name = m[1];
		const value = m[2] ?? m[3] ?? m[4] ?? '';
		if (name) out.push([name, decodeEntities(value)]);
	}
	return out;
}

function decodeEntities(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function sanitizeUrl(url: string, attr: 'href' | 'src'): string {
	const trimmed = url.trim();
	const lower = trimmed.toLowerCase();
	if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) return '#';
	// Allow data: URLs only for inline images.
	if (lower.startsWith('data:')) {
		if (attr === 'src' && lower.startsWith('data:image/')) return trimmed;
		return '#';
	}
	return trimmed;
}

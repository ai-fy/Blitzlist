/**
 * QR code generation as SVG (base64), suitable for MCP image content blocks.
 *
 * SVG output — vector, sharp at any scale, smaller payload than PNG, and
 * avoids the Node Buffer dependency (Workers doesn't ship Buffer without
 * the nodejs_compat flag). Base64-encoded SVG goes straight into an MCP
 * ImageContent block with mimeType `image/svg+xml`.
 *
 * Default scale: ~232×232 px for a typical 4-word share-code URL — readable
 * from a couple feet on a laptop screen or phone projection.
 */

import QRCode from 'qrcode';

export type QrOptions = {
	/** Pixel size of each "module" (QR cell). Default 8. */
	scale?: number;
	/** White margin in modules around the code. Default 2. */
	margin?: number;
};

export type QrResult = {
	/** Base64-encoded SVG (no data: prefix). For MCP ImageContent.data. */
	base64: string;
	/** MIME type to pair with the base64 data. */
	mimeType: 'image/svg+xml';
	/** Raw SVG string — useful for embedding directly in HTML. */
	svg: string;
};

export async function generateQrSvg(text: string, opts: QrOptions = {}): Promise<QrResult> {
	const svg = await QRCode.toString(text, {
		type: 'svg',
		errorCorrectionLevel: 'M',
		margin: opts.margin ?? 2,
		// QRCode's SVG output doesn't use `scale` directly — it relies on the
		// viewBox + width/height attributes. We patch them post-generation to
		// hit a target physical size.
		color: { dark: '#0a0a0a', light: '#ffffff' },
	});
	const sized = setSvgSize(svg, opts.scale ?? 8);
	const base64 = btoa(unescape(encodeURIComponent(sized)));
	return { base64, mimeType: 'image/svg+xml', svg: sized };
}

// Replace the SVG's width/height with module-count × scale so it renders
// at a predictable physical size in chat clients.
function setSvgSize(svg: string, scale: number): string {
	// qrcode emits something like: <svg ... viewBox="0 0 29 29" ...>
	const viewBoxMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
	if (!viewBoxMatch) return svg;
	const modules = Number(viewBoxMatch[1]);
	const px = modules * scale;
	return svg
		.replace(/width="[^"]+"/, `width="${px}"`)
		.replace(/height="[^"]+"/, `height="${px}"`);
}

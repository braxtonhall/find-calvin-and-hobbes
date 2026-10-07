import fs from "fs";
import path from "path";

export interface ImageSize {
	width: number;
	height: number;
}

/** `length` bytes of the file from `position`, or fewer where it ends first. */
function readAt(fd: number, position: number, length: number): Buffer {
	const buffer = Buffer.alloc(length);
	const read = fs.readSync(fd, buffer, 0, length, position);
	return buffer.subarray(0, read);
}

/** A JPEG's size, from the first frame header: walked to marker by marker, since what comes before it can be long. */
function jpegSize(fd: number): ImageSize | null {
	let position = 2;
	for (;;) {
		const marker = readAt(fd, position, 9);
		if (marker.length < 4 || marker[0] !== 0xff) return null;
		const type = marker[1];
		// Fill bytes, and the markers that stand alone with no length after them.
		if (type === 0xff) {
			position += 1;
			continue;
		}
		if (type === 0x01 || (type >= 0xd0 && type <= 0xd7)) {
			position += 2;
			continue;
		}
		// Start of frame: every SOFn but DHT (C4), JPG (C8) and DAC (CC).
		if (type >= 0xc0 && type <= 0xcf && type !== 0xc4 && type !== 0xc8 && type !== 0xcc) {
			if (marker.length < 9) return null;
			return { width: marker.readUInt16BE(7), height: marker.readUInt16BE(5) };
		}
		position += 2 + marker.readUInt16BE(2);
	}
}

function webpSize(head: Buffer): ImageSize | null {
	const chunk = head.toString("ascii", 12, 16);
	if (chunk === "VP8 " && head.length >= 30) {
		return { width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff };
	}
	if (chunk === "VP8L" && head.length >= 25) {
		const bits = head.readUInt32LE(21);
		return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
	}
	if (chunk === "VP8X" && head.length >= 30) {
		return { width: head.readUIntLE(24, 3) + 1, height: head.readUIntLE(27, 3) + 1 };
	}
	return null;
}

/**
 * An image's size in pixels, read from the head of its file rather than the whole of it, since the
 * build reads every strip's: a GIF, PNG, JPEG, WebP or BMP. Anything else, or a file too broken to
 * say, stops the build, naming the file.
 */
export function imageSize(file: string): ImageSize {
	const fd = fs.openSync(file, "r");
	try {
		const head = readAt(fd, 0, 32);
		let size: ImageSize | null = null;
		if (head.toString("ascii", 0, 3) === "GIF") {
			size = { width: head.readUInt16LE(6), height: head.readUInt16LE(8) };
		} else if (head.toString("ascii", 1, 4) === "PNG") {
			size = { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
		} else if (head[0] === 0xff && head[1] === 0xd8) {
			size = jpegSize(fd);
		} else if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") {
			size = webpSize(head);
		} else if (head.toString("ascii", 0, 2) === "BM") {
			size = { width: head.readInt32LE(18), height: Math.abs(head.readInt32LE(22)) };
		}
		if (!size || !(size.width > 0) || !(size.height > 0)) {
			throw new Error(`${path.basename(file)} is not an image the build can read the size of`);
		}
		return size;
	} finally {
		fs.closeSync(fd);
	}
}

/** Each file's size, kept while the file is unchanged, so a rebuild under `--watch` reads only what changed. */
const sizes = new Map<string, { stamp: string; size: ImageSize }>();

/** `imageSize`, read again only once the file has changed. */
export function knownImageSize(file: string): ImageSize {
	const { mtimeMs, size } = fs.statSync(file);
	const stamp = `${mtimeMs} ${size}`;
	const known = sizes.get(file);
	if (known?.stamp === stamp) return known.size;
	const read = imageSize(file);
	sizes.set(file, { stamp, size: read });
	return read;
}

/** An image's width over its height, to four places, as a page holds the space for it while it loads. */
export function aspectRatio(file: string): number {
	const { width, height } = knownImageSize(file);
	return Math.round((width / height) * 10000) / 10000;
}

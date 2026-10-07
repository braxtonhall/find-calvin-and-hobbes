import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { imageSize } from "../build-chain/imageSize";
import { sampleGif } from "./helpers/config";

/** The size of an image with these contents, as the build reads it. */
function sizeOf(contents: Buffer): { width: number; height: number } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "image-"));
	try {
		const file = path.join(dir, "image");
		fs.writeFileSync(file, contents);
		return imageSize(file);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function png(width: number, height: number): Buffer {
	const head = Buffer.alloc(24);
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head);
	head.write("IHDR", 12, "ascii");
	head.writeUInt32BE(width, 16);
	head.writeUInt32BE(height, 20);
	return head;
}

/** A JPEG whose frame header comes after an APP0 segment and a stray fill byte, as the walk must skip. */
function jpeg(width: number, height: number): Buffer {
	const app0 = Buffer.alloc(18);
	app0.writeUInt16BE(0xffe0, 0);
	app0.writeUInt16BE(16, 2);
	const sof = Buffer.alloc(19);
	sof.writeUInt16BE(0xffc2, 0);
	sof.writeUInt16BE(17, 2);
	sof[4] = 8;
	sof.writeUInt16BE(height, 5);
	sof.writeUInt16BE(width, 7);
	return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, Buffer.from([0xff]), sof]);
}

function bmp(width: number, height: number): Buffer {
	const head = Buffer.alloc(26);
	head.write("BM", 0, "ascii");
	head.writeInt32LE(width, 18);
	head.writeInt32LE(height, 22);
	return head;
}

function webp(chunk: "VP8 " | "VP8L" | "VP8X", width: number, height: number): Buffer {
	const head = Buffer.alloc(30);
	head.write("RIFF", 0, "ascii");
	head.write("WEBP", 8, "ascii");
	head.write(chunk, 12, "ascii");
	if (chunk === "VP8 ") {
		head.writeUInt16LE(width, 26);
		head.writeUInt16LE(height, 28);
	} else if (chunk === "VP8L") {
		head.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
	} else {
		head.writeUIntLE(width - 1, 24, 3);
		head.writeUIntLE(height - 1, 27, 3);
	}
	return head;
}

test("reads an image's size from the head of its file", () => {
	assert.deepEqual(sizeOf(sampleGif(722, 103)), { width: 722, height: 103 });
	assert.deepEqual(sizeOf(png(444, 475)), { width: 444, height: 475 });
	assert.deepEqual(sizeOf(jpeg(761, 800)), { width: 761, height: 800 });
	assert.deepEqual(sizeOf(bmp(300, -374)), { width: 300, height: 374 });
	assert.deepEqual(sizeOf(webp("VP8 ", 640, 480)), { width: 640, height: 480 });
	assert.deepEqual(sizeOf(webp("VP8L", 640, 480)), { width: 640, height: 480 });
	assert.deepEqual(sizeOf(webp("VP8X", 640, 480)), { width: 640, height: 480 });
});

test("refuses a file that is no image it can read", () => {
	assert.throws(() => sizeOf(Buffer.from("not an image")), /image is not an image the build can read the size of/);
	// A JPEG cut off before its frame header.
	assert.throws(() => sizeOf(jpeg(1, 1).subarray(0, 12)), /not an image/);
});

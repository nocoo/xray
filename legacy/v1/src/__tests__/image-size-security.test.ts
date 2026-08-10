import { describe, expect, it } from "vitest";
import { imageSize } from "image-size";

const encoder = new TextEncoder();

function writeBoxHeader(
  input: Uint8Array,
  offset: number,
  size: number,
  type: string,
) {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  view.setUint32(offset, size, false);
  input.set(encoder.encode(type), offset + 4);
}

describe("image-size malformed container regressions", () => {
  it("rejects an ICNS entry whose length cannot advance the parser", () => {
    const input = new Uint8Array(16);
    input.set(encoder.encode("icns"), 0);
    new DataView(input.buffer).setUint32(4, input.length, false);
    input.set(encoder.encode("ic07"), 8);

    expect(() => imageSize(input)).toThrowError("Invalid ICNS entry length");
  });

  it("rejects a zero-sized HEIF ispe box", () => {
    const input = new Uint8Array(64);
    writeBoxHeader(input, 0, 16, "ftyp");
    input.set(encoder.encode("heic"), 8);
    writeBoxHeader(input, 16, 48, "meta");
    writeBoxHeader(input, 28, 36, "iprp");
    writeBoxHeader(input, 36, 28, "ipco");
    writeBoxHeader(input, 44, 0, "ispe");

    expect(() => imageSize(input)).toThrowError(
      "Invalid HEIF, zero-sized ispe box",
    );
  });

  it("rejects a zero-sized JXL partial-stream box", () => {
    const input = new Uint8Array(44);
    writeBoxHeader(input, 0, 12, "JXL ");
    input.set(Uint8Array.of(0x0d, 0x0a, 0x87, 0x0a), 8);
    writeBoxHeader(input, 12, 20, "ftyp");
    input.set(encoder.encode("jxl "), 20);
    writeBoxHeader(input, 32, 0, "jxlp");

    expect(() => imageSize(input)).toThrowError(
      "Invalid JXL, zero-sized jxlp box",
    );
  });
});

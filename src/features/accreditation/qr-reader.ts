import { inflateSync } from "node:zlib";
import jsQR from "jsqr";
import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  PDFString,
  type PDFObject,
} from "pdf-lib";
import sharp from "sharp";

/**
 * Reads the QR codes of an uploaded constancia, all in this process (no
 * external service): an image is decoded with sharp and read with jsQR; a PDF
 * is not rendered, its first page is searched for the images it embeds (the
 * QR is one) and for link annotations. A QR drawn as vector paths is not
 * found: the user is asked to upload the QR's image instead.
 */

export class UnreadableUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableUploadError";
  }
}

export type UploadKind = "pdf" | "image";

/** Larger images are refused before decoding (pixel bombs). */
const MAX_INPUT_PIXELS = 40_000_000;
/** At most this many embedded images are tried in a PDF. */
const MAX_PDF_IMAGES = 40;
/** An inflated PDF image larger than this is skipped. */
const MAX_INFLATED_BYTES = 64 * 1024 * 1024;

/** Tells a PDF from an image by its content, never by the name or the declared type. */
export async function detectUploadKind(bytes: Uint8Array): Promise<UploadKind | null> {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  if (head.includes("%PDF-")) return "pdf";
  try {
    const metadata = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    return metadata.format && ["jpeg", "png", "webp"].includes(metadata.format) ? "image" : null;
  } catch {
    return null;
  }
}

/** Every text found in QR codes (and, in a PDF, link annotations) of the upload, without repeats. */
export async function readQrTexts(bytes: Uint8Array, kind: UploadKind): Promise<string[]> {
  const texts = kind === "pdf" ? await readPdf(bytes) : await readImage(() => sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }));
  return [...new Set(texts.filter((text) => text.trim().length > 0))];
}

/* ------------------------------------------------------------------ */
/*  Images                                                             */
/* ------------------------------------------------------------------ */

async function readImage(open: () => sharp.Sharp): Promise<string[]> {
  let metadata: sharp.Metadata;
  try {
    metadata = await open().metadata();
  } catch {
    throw new UnreadableUploadError("No pudimos abrir la imagen. Sube un JPG, PNG o WebP.");
  }
  const largest = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  if (!largest) return [];
  // A QR stored with one pixel per module is enlarged without smoothing; a photo is tried at two sizes.
  const attempts =
    largest < 600
      ? [{ size: Math.min(1200, largest * Math.ceil(600 / largest)), kernel: sharp.kernel.nearest }]
      : [{ size: Math.min(largest, 1600), kernel: sharp.kernel.lanczos3 }, { size: Math.min(largest, 900), kernel: sharp.kernel.lanczos3 }];
  for (const attempt of attempts) {
    const { data, info } = await open()
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: attempt.size, height: attempt.size, fit: "inside", kernel: attempt.kernel, withoutEnlargement: largest >= 600 })
      // The quiet zone around the code is often cropped away; give it one back.
      .extend({ top: 32, bottom: 32, left: 32, right: 32, background: "#ffffff" })
      // jsQR reads RGBA: a gray image gets its three channels first.
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, {
      inversionAttempts: "attemptBoth",
    });
    if (code?.data) return [code.data];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  PDF                                                                */
/* ------------------------------------------------------------------ */

async function readPdf(bytes: Uint8Array): Promise<string[]> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  } catch {
    throw new UnreadableUploadError("No pudimos abrir el PDF. Sube el PDF original de la constancia o una imagen de su código QR.");
  }
  if (pdf.getPageCount() === 0) return [];
  const page = pdf.getPage(0);
  const texts = linkUris(page.node.Annots());

  const images: PDFRawStream[] = [];
  collectImages(pdf, page.node.Resources(), images, new Set(), 0);
  for (const image of images.slice(0, MAX_PDF_IMAGES)) {
    const open = imageOpener(pdf, image);
    if (!open) continue;
    try {
      texts.push(...(await readImage(open)));
    } catch {
      // An image this reader cannot decode is skipped; another may hold the QR.
    }
    if (texts.length) break;
  }
  return texts;
}

function linkUris(annots: PDFArray | undefined): string[] {
  if (!annots) return [];
  const uris: string[] = [];
  for (let index = 0; index < annots.size(); index += 1) {
    const annot = annots.lookup(index);
    if (!(annot instanceof PDFDict)) continue;
    const action = annot.lookup(PDFName.of("A"));
    if (!(action instanceof PDFDict)) continue;
    const uri = action.lookup(PDFName.of("URI"));
    if (uri instanceof PDFString || uri instanceof PDFHexString) uris.push(uri.decodeText());
  }
  return uris;
}

function collectImages(pdf: PDFDocument, resources: PDFDict | undefined, out: PDFRawStream[], seen: Set<PDFObject>, depth: number) {
  const xobjects = resources?.lookup(PDFName.of("XObject"));
  if (!(xobjects instanceof PDFDict)) return;
  for (const [, ref] of xobjects.entries()) {
    const object = pdf.context.lookup(ref);
    if (!(object instanceof PDFRawStream) || seen.has(object)) continue;
    seen.add(object);
    const subtype = object.dict.get(PDFName.of("Subtype"));
    if (subtype === PDFName.of("Image")) out.push(object);
    else if (subtype === PDFName.of("Form") && depth < 3) {
      const nested = object.dict.lookup(PDFName.of("Resources"));
      collectImages(pdf, nested instanceof PDFDict ? nested : undefined, out, seen, depth + 1);
    }
  }
}

const numberOf = (dict: PDFDict, key: string, fallback: number) => {
  const value = dict.lookup(PDFName.of(key));
  return value instanceof PDFNumber ? value.asNumber() : fallback;
};

function filterNames(dict: PDFDict): string[] {
  const filter = dict.lookup(PDFName.of("Filter"));
  if (filter instanceof PDFName) return [filter.decodeText()];
  if (filter instanceof PDFArray) return filter.asArray().map((item) => (item instanceof PDFName ? item.decodeText() : "?"));
  return [];
}

function decodeParms(dict: PDFDict, filterIndex: number): PDFDict | undefined {
  const parms = dict.lookup(PDFName.of("DecodeParms"));
  if (parms instanceof PDFDict) return parms;
  if (parms instanceof PDFArray) {
    const item = parms.lookup(filterIndex);
    return item instanceof PDFDict ? item : undefined;
  }
  return undefined;
}

/** A sharp pipeline over one embedded image, or null when its encoding is not one read here. */
function imageOpener(pdf: PDFDocument, image: PDFRawStream): (() => sharp.Sharp) | null {
  const { dict } = image;
  const width = numberOf(dict, "Width", 0);
  const height = numberOf(dict, "Height", 0);
  if (width < 21 || height < 21 || width * height > MAX_INPUT_PIXELS) return null;

  const filters = filterNames(dict);
  let data: Uint8Array = image.contents;
  for (const [index, filter] of filters.entries()) {
    if (filter === "DCTDecode" && index === filters.length - 1) {
      const jpeg = Buffer.from(data);
      return () => sharp(jpeg, { limitInputPixels: MAX_INPUT_PIXELS });
    }
    if (filter !== "FlateDecode") return null;
    try {
      data = inflateSync(data, { maxOutputLength: MAX_INFLATED_BYTES });
    } catch {
      return null;
    }
    const parms = decodeParms(dict, index);
    if (parms && numberOf(parms, "Predictor", 1) >= 10) {
      data = undoPngPredictor(data, numberOf(parms, "Colors", 1), numberOf(parms, "BitsPerComponent", 8), numberOf(parms, "Columns", 1));
    }
  }

  const imageMask = dict.lookup(PDFName.of("ImageMask")) === PDFBool.True;
  const bitsPerComponent = imageMask ? 1 : numberOf(dict, "BitsPerComponent", 8);
  const colorSpace = imageMask ? { components: 1 } : resolveColorSpace(pdf, dict.lookup(PDFName.of("ColorSpace")));
  if (!colorSpace || ![1, 2, 4, 8].includes(bitsPerComponent)) return null;
  const pixels = toEightBit(data, width, height, bitsPerComponent, colorSpace);
  if (!pixels) return null;
  const raw = { width, height, channels: pixels.channels };
  return () => sharp(pixels.data, { raw, limitInputPixels: MAX_INPUT_PIXELS });
}

type ColorSpace = { components: number; palette?: { base: number; bytes: Uint8Array; maxIndex: number } };

function resolveColorSpace(pdf: PDFDocument, value: PDFObject | undefined, depth = 0): ColorSpace | null {
  if (depth > 3 || !value) return null;
  if (value instanceof PDFName) {
    const name = value.decodeText();
    if (name === "DeviceGray" || name === "CalGray" || name === "G") return { components: 1 };
    if (name === "DeviceRGB" || name === "CalRGB" || name === "RGB") return { components: 3 };
    if (name === "DeviceCMYK" || name === "CMYK") return { components: 4 };
    return null;
  }
  if (!(value instanceof PDFArray) || value.size() === 0) return null;
  const family = value.lookup(0);
  const familyName = family instanceof PDFName ? family.decodeText() : "";
  if (familyName === "ICCBased") {
    const profile = value.lookup(1);
    const components = profile instanceof PDFStream ? numberOf(profile.dict, "N", 3) : 3;
    return [1, 3, 4].includes(components) ? { components } : null;
  }
  if (familyName === "CalGray") return { components: 1 };
  if (familyName === "CalRGB") return { components: 3 };
  if (familyName === "Indexed" || familyName === "I") {
    const base = resolveColorSpace(pdf, value.lookup(1), depth + 1);
    const maxIndex = value.lookup(2);
    const lookup = value.lookup(3);
    const bytes =
      lookup instanceof PDFString || lookup instanceof PDFHexString
        ? lookup.asBytes()
        : lookup instanceof PDFRawStream
          ? streamBytes(lookup)
          : null;
    if (!base || base.palette || !(maxIndex instanceof PDFNumber) || !bytes) return null;
    return { components: 1, palette: { base: base.components, bytes, maxIndex: maxIndex.asNumber() } };
  }
  return null;
}

function streamBytes(stream: PDFRawStream): Uint8Array | null {
  const filters = filterNames(stream.dict);
  if (!filters.length) return stream.contents;
  if (filters.length === 1 && filters[0] === "FlateDecode") {
    try {
      return inflateSync(stream.contents, { maxOutputLength: 1024 * 1024 });
    } catch {
      return null;
    }
  }
  return null;
}

/** PNG predictors (PDF Predictor 10–15): each row starts with its filter type. */
function undoPngPredictor(data: Uint8Array, colors: number, bitsPerComponent: number, columns: number): Uint8Array {
  const bytesPerPixel = Math.max(1, Math.ceil((colors * bitsPerComponent) / 8));
  const rowLength = Math.ceil((colors * bitsPerComponent * columns) / 8);
  const rows = Math.floor(data.length / (rowLength + 1));
  const out = new Uint8Array(rows * rowLength);
  for (let row = 0; row < rows; row += 1) {
    const type = data[row * (rowLength + 1)];
    const source = row * (rowLength + 1) + 1;
    const target = row * rowLength;
    for (let index = 0; index < rowLength; index += 1) {
      const raw = data[source + index];
      const left = index >= bytesPerPixel ? out[target + index - bytesPerPixel] : 0;
      const up = row > 0 ? out[target - rowLength + index] : 0;
      const upLeft = row > 0 && index >= bytesPerPixel ? out[target - rowLength + index - bytesPerPixel] : 0;
      let value: number;
      switch (type) {
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + Math.floor((left + up) / 2); break;
        case 4: {
          const estimate = left + up - upLeft;
          const toLeft = Math.abs(estimate - left);
          const toUp = Math.abs(estimate - up);
          const toUpLeft = Math.abs(estimate - upLeft);
          value = raw + (toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft);
          break;
        }
        default: value = raw;
      }
      out[target + index] = value & 0xff;
    }
  }
  return out;
}

/** Unpacks the samples to one byte per channel: gray, RGB (CMYK converted) or a palette's colors. */
function toEightBit(
  data: Uint8Array,
  width: number,
  height: number,
  bitsPerComponent: number,
  colorSpace: ColorSpace,
): { data: Buffer; channels: 1 | 3 } | null {
  const components = colorSpace.components;
  const rowLength = Math.ceil((width * components * bitsPerComponent) / 8);
  if (data.length < rowLength * height) return null;
  const maxSample = (1 << bitsPerComponent) - 1;
  const sampleAt = (row: number, sampleIndex: number) => {
    if (bitsPerComponent === 8) return data[row * rowLength + sampleIndex];
    const bit = sampleIndex * bitsPerComponent;
    const byte = data[row * rowLength + (bit >> 3)];
    return (byte >> (8 - bitsPerComponent - (bit & 7))) & maxSample;
  };

  const palette = colorSpace.palette;
  const outChannels: 1 | 3 = palette ? (palette.base === 1 ? 1 : 3) : components === 1 ? 1 : 3;
  const out = Buffer.alloc(width * height * outChannels);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const target = (row * width + column) * outChannels;
      if (palette) {
        const index = Math.min(sampleAt(row, column), palette.maxIndex);
        const entry = index * palette.base;
        if (palette.base === 4) {
          const [c, m, y, k] = [0, 1, 2, 3].map((offset) => (palette.bytes[entry + offset] ?? 0) / 255);
          out[target] = 255 * (1 - c) * (1 - k);
          out[target + 1] = 255 * (1 - m) * (1 - k);
          out[target + 2] = 255 * (1 - y) * (1 - k);
        } else {
          for (let channel = 0; channel < outChannels; channel += 1) out[target + channel] = palette.bytes[entry + channel] ?? 0;
        }
        continue;
      }
      const scale = (value: number) => (bitsPerComponent === 8 ? value : Math.round((value * 255) / maxSample));
      const first = column * components;
      if (components === 1) out[target] = scale(sampleAt(row, first));
      else if (components === 3) {
        for (let channel = 0; channel < 3; channel += 1) out[target + channel] = scale(sampleAt(row, first + channel));
      } else {
        const [c, m, y, k] = [0, 1, 2, 3].map((offset) => scale(sampleAt(row, first + offset)) / 255);
        out[target] = 255 * (1 - c) * (1 - k);
        out[target + 1] = 255 * (1 - m) * (1 - k);
        out[target + 2] = 255 * (1 - y) * (1 - k);
      }
    }
  }
  return { data: out, channels: outChannels };
}

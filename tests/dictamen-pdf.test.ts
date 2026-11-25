import assert from "node:assert/strict";
import { test } from "node:test";
import { dictamenPdfFilename } from "../src/features/valuations/services/dictamen-pdf.service";
import sharp from "sharp";
import { internalAppUrl, readPrintCopy, secondPassOrFirst, servePrintCopies } from "../src/infrastructure/pdf/chromium-pdf";
import { S3StorageProvider } from "../src/infrastructure/storage/storage-provider";
import { MAX_PRINT_COPY_BYTES, printCopies, readableForPrintCopy } from "../src/infrastructure/pdf/print-images";

test("the PDF is named after the folio, safe for any browser", () => {
  assert.equal(dictamenPdfFilename("VDA-0001"), "Dictamen-VDA-0001.pdf");
  assert.equal(dictamenPdfFilename("TCH 004/05 2026"), "Dictamen-TCH-004-05-2026.pdf");
  assert.equal(dictamenPdfFilename("Avalúo \"Ñ\""), "Dictamen-Avaluo-N.pdf");
  assert.equal(dictamenPdfFilename("///"), "Dictamen-avaluo.pdf");
});

test("Chromium reaches the app on this machine unless told otherwise", () => {
  const saved = { internal: process.env.INTERNAL_APP_URL, port: process.env.PORT };
  try {
    delete process.env.INTERNAL_APP_URL;
    process.env.PORT = "3000";
    assert.equal(internalAppUrl(), "http://127.0.0.1:3000");
    process.env.INTERNAL_APP_URL = "http://localhost:3100/";
    assert.equal(internalAppUrl(), "http://localhost:3100");
  } finally {
    if (saved.internal === undefined) delete process.env.INTERNAL_APP_URL; else process.env.INTERNAL_APP_URL = saved.internal;
    if (saved.port === undefined) delete process.env.PORT; else process.env.PORT = saved.port;
  }
});

test("S-1: when the second opening fails, the PDF prints the first one, already valid, says so and closes the second", async (t) => {
  const warn = t.mock.method(console, "warn", () => undefined);
  const closed: string[] = [];
  const page = (name: string) => ({ name, close: async () => { closed.push(name); if (name === "broken") throw new Error("Target closed"); } });
  const first = page("first");
  const timeout = async () => { throw new Error("Timeout 30000ms exceeded"); };
  assert.equal(await secondPassOrFirst(first, async () => page("second"), timeout, "/avaluos/x/dictamen"), first);
  assert.deepEqual(closed, ["second"]);
  assert.equal(await secondPassOrFirst(first, async () => page("broken"), timeout, "/avaluos/x/dictamen"), first, "a close that fails is ignored");
  assert.equal(await secondPassOrFirst(first, timeout, async () => undefined, "/avaluos/x/dictamen"), first, "no second page was made");
  assert.equal(warn.mock.callCount(), 3);
  assert.equal((await secondPassOrFirst(first, async () => page("second"), async () => undefined, "/avaluos/x/dictamen")).name, "second");
  assert.deepEqual(closed, ["second", "broken"]);
});

test("S-1: when the print copies cannot be made, the PDF prints its photos as stored", async (t) => {
  const warn = t.mock.method(console, "warn", () => undefined);
  const page = { evaluate: async () => { throw new Error("Execution context was destroyed"); } };
  assert.equal(await servePrintCopies({} as never, page as never, "http://127.0.0.1:3000"), false);
  assert.equal(warn.mock.callCount(), 1);
});

test("S-2: a photo is read again through one redirect at most, only to our bucket, and only with a declared size", async () => {
  const app = "http://127.0.0.1:3000";
  const s3 = { bucket: "fotos", region: "us-east-1", accessKeyId: "AKIAINVENTADA", secretAccessKey: "secreto-inventado" };
  const bucket = "https://fotos.s3.us-east-1.amazonaws.com/a.jpg?X-Amz-Signature=1";
  const photo = Buffer.from("jpeg");
  const respond = (status: number, headers: Record<string, string>) => ({
    status: () => status, ok: () => status >= 200 && status < 300, headers: () => headers, body: async () => photo, dispose: async () => undefined,
  });
  const serve = (routes: Record<string, ReturnType<typeof respond>>) => {
    const asked: Array<{ url: string; maxRedirects?: number }> = [];
    return { asked, request: { get: async (url: string, options?: { maxRedirects?: number }) => { asked.push({ url, maxRedirects: options?.maxRedirects }); return routes[url]; } } as never };
  };
  const image = `${app}/api/archivos/imagen?key=a.jpg`;
  const sized = { "content-length": String(photo.length) };

  const viaBucket = serve({ [image]: respond(302, { location: bucket }), [bucket]: respond(200, sized) });
  assert.equal(await readPrintCopy(viaBucket.request, image, app, s3, 1_000), photo);
  assert.deepEqual(viaBucket.asked, [{ url: image, maxRedirects: 0 }, { url: bucket, maxRedirects: 0 }]);

  const elsewhere = serve({ [image]: respond(302, { location: "http://169.254.169.254/latest/meta-data" }) });
  assert.equal(await readPrintCopy(elsewhere.request, image, app, s3, 1_000), null);
  assert.equal(elsewhere.asked.length, 1, "a redirect outside our addresses is never followed");

  const twice = serve({ [image]: respond(302, { location: bucket }), [bucket]: respond(302, { location: `${bucket}&again=1` }) });
  assert.equal(await readPrintCopy(twice.request, image, app, s3, 1_000), null);
  assert.equal(twice.asked.length, 2, "a second redirect is not followed");

  assert.equal(await readPrintCopy(serve({ [image]: respond(200, {}) }).request, image, app, s3, 1_000), null, "without a declared size");
  const heavy = { "content-length": String(MAX_PRINT_COPY_BYTES + 1) };
  assert.equal(await readPrintCopy(serve({ [image]: respond(200, heavy) }).request, image, app, s3, 1_000), null, "heavier than an upload");
  assert.equal(await readPrintCopy(serve({ [image]: respond(200, sized) }).request, image, app, s3, 1_000), photo);
});

test("S-2: only this app and the bucket of the stored images are read again on the server", async () => {
  const app = "http://127.0.0.1:3000";
  const s3 = { bucket: "fotos", region: "us-east-1", accessKeyId: "AKIAINVENTADA", secretAccessKey: "secreto-inventado" };
  for (const config of [s3, { ...s3, endpoint: "http://localhost:9000" }]) {
    const signed = await new S3StorageProvider({ driver: "s3", s3: config }).getPrivateDownloadUrl("uploads/2026-11/a.jpg");
    assert.equal(readableForPrintCopy(signed, app, config), true, signed);
  }
  assert.equal(readableForPrintCopy("http://127.0.0.1:3000/api/archivos/imagen?key=a.jpg", app), true);
  assert.equal(readableForPrintCopy("https://fotos.s3.us-east-1.amazonaws.com/a.jpg?X-Amz-Signature=1", app, s3), true);
  assert.equal(readableForPrintCopy("https://fotos.s3.us-east-1.amazonaws.com/a.jpg", app), false, "without a bucket configured");
  assert.equal(readableForPrintCopy("https://otro.s3.us-east-1.amazonaws.com/a.jpg", app, s3), false);
  assert.equal(readableForPrintCopy("http://169.254.169.254/latest/meta-data", app, s3), false);
  assert.equal(readableForPrintCopy("https://ejemplo.com/foto.jpg", app, s3), false);
  const minio = { ...s3, endpoint: "http://localhost:9000" };
  assert.equal(readableForPrintCopy("http://localhost:9000/fotos/a.jpg", app, minio), true);
  assert.equal(readableForPrintCopy("http://localhost:9001/fotos/a.jpg", app, minio), false);
  assert.equal(readableForPrintCopy("http://localhost:9000/otro/a.jpg", app, minio), false, "another bucket on the endpoint");
});

test("S-2: photos are read again four at a time, and a file heavier than an upload is left as stored", async () => {
  const photo = await sharp({ create: { width: 1920, height: 1440, channels: 3, background: "#8a7a6a" } }).jpeg({ quality: 85 }).toBuffer();
  const heavy = Buffer.alloc(MAX_PRINT_COPY_BYTES + 1);
  let reading = 0;
  let most = 0;
  const wanted = Array.from({ length: 10 }, (_, index) => [`http://127.0.0.1:3000/f${index}.jpg`, 700] as const);
  const copies = await printCopies(wanted, async (src) => {
    reading += 1;
    most = Math.max(most, reading);
    await new Promise((resolve) => setTimeout(resolve, 5));
    reading -= 1;
    return src.endsWith("f3.jpg") ? heavy : photo;
  }, 10_000);
  assert.equal(most, 4);
  assert.equal(copies.size, 9);
  assert.equal(copies.has("http://127.0.0.1:3000/f3.jpg"), false);
});

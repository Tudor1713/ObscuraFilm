// Decodes HEIC/HEIF photos (the iPhone's default format, which Chromium cannot read) off the main
// thread with libheif's wasm build, and hands back an ImageBitmap.
import factory from '../vendor/libheif-bundle.mjs';

let lib = null;
self.onmessage = async ({ data: { id, buf, p3 } }) => {
  let ctx = null, images = [];
  try {
    lib ||= await factory();
    ctx = new lib.HeifDecoder();
    images = ctx.decode(new Uint8Array(buf));
    const im = images.find(i => i.is_primary()) || images[0];
    if (!im) throw new Error('no image in file');
    // libheif applies the file's rotation / mirroring, and reports the size after it
    const w = im.get_width(), h = im.get_height();
    const px = await new Promise((res, rej) => im.display(
      { data: new Uint8ClampedArray(w * h * 4), width: w, height: h },
      d => d ? res(d.data) : rej(new Error('decode failed')),
    ));
    // iPhone photos are Display P3; tagging them lets the canvas convert to sRGB instead of washing out
    const bmp = await createImageBitmap(new ImageData(px, w, h, { colorSpace: p3 ? 'display-p3' : 'srgb' }));
    self.postMessage({ id, bmp }, [bmp]);
  } catch (e) {
    self.postMessage({ id, error: String(e?.message || e) });
  } finally {
    for (const i of images) i.free();
    if (ctx?.decoder) lib.heif_context_free(ctx.decoder);
  }
};

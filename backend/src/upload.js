const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { bad } = require('./lib');

const dir = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, '../uploads');
fs.mkdirSync(dir, { recursive: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (/^image\/(jpeg|png|webp)$/.test(file.mimetype) ? cb(null, true) : cb(bad('Only JPG, PNG or WebP images are allowed.'))),
});

// Re-encodes to WebP (strips metadata, caps size) and makes a thumbnail.
async function saveImage(buffer) {
  const id = crypto.randomUUID();
  try {
    const img = sharp(buffer).rotate();
    await img.clone().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(dir, `${id}.webp`));
    await img.clone().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }).toFile(path.join(dir, `${id}-thumb.webp`));
  } catch { throw bad('That file is not a valid image.'); }
  return { url: `/uploads/${id}.webp`, thumb_url: `/uploads/${id}-thumb.webp` };
}
function removeImage(...urls) {
  for (const u of urls) {
    if (u && /^\/uploads\/[\w-]+(-thumb)?\.webp$/.test(u)) fs.promises.unlink(path.join(dir, path.basename(u))).catch(() => {});
  }
}
module.exports = { upload, saveImage, removeImage, uploadDir: dir };

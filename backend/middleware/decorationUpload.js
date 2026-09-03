import multer from 'multer';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

export const decorationUploadsDirectory = path.resolve(process.cwd(), 'uploads', 'decorations');

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('نوع الصورة غير مسموح. استخدم JPG أو JPEG أو PNG أو WebP.'));
    }
    return callback(null, true);
  },
});

const matchesSignature = (buffer, mimeType) => {
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
};

export const receiveDecorationImage = (req, res, next) => upload.single('image')(req, res, (error) => {
  if (error) {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت.' });
    return res.status(400).json({ message: error.message || 'تعذر استقبال الصورة.' });
  }
  if (!req.file || !matchesSignature(req.file.buffer, req.file.mimetype)) {
    return res.status(400).json({ message: 'محتوى الصورة غير صالح أو لا يطابق نوع الملف.' });
  }
  return next();
});

export const saveDecorationImage = async (file) => {
  await fs.promises.mkdir(decorationUploadsDirectory, { recursive: true });
  const extension = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
  const filename = `${randomUUID()}${extension}`;
  const absolutePath = path.join(decorationUploadsDirectory, filename);
  await fs.promises.writeFile(absolutePath, file.buffer, { flag: 'wx' });
  return { filename, absolutePath, imageUrl: `/uploads/decorations/${filename}` };
};

export const removeDecorationImage = async (imageUrl) => {
  if (!imageUrl || !imageUrl.startsWith('/uploads/decorations/')) return;
  const filename = path.basename(imageUrl);
  if (filename !== imageUrl.slice('/uploads/decorations/'.length)) return;
  await fs.promises.rm(path.join(decorationUploadsDirectory, filename), { force: true });
};

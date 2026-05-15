import { Router, static as serveStatic } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve('uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
  'application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed',
  'application/pdf',
  'application/octet-stream',
];
const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(AppError.validation(`Tipo de arquivo não permitido: ${file.mimetype}`));
    }
  },
});

// POST /uploads — upload direto (local dev / fallback)
router.post('/uploads', requireAuth, requireRole('admin', 'gestor', 'editor'), upload.single('file'), (req, res) => {
  if (!req.file) throw AppError.validation('Nenhum arquivo enviado');

  const url = `/uploads/${req.file.filename}`;
  res.status(201).json({
    url,
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// GET /uploads/sign — presigned URL (produção: S3/R2)
// Se S3 não configurado, retorna URL para upload direto
router.get('/uploads/sign', requireAuth, requireRole('admin', 'gestor', 'editor'), (req, res, next) => {
  try {
    const { filename, contentType } = req.query;

    if (!filename) throw AppError.validation('filename é obrigatório');

    const ext = path.extname(String(filename));
    const key = `${crypto.randomUUID()}${ext}`;

    // Se S3 configurado — gerar presigned URL
    if (process.env.S3_BUCKET && process.env.S3_ENDPOINT) {
      // Assíncrono, mas retornamos placeholder por simplicidade
      // Em produção, usar @aws-sdk/s3-request-presigner aqui
      const url = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${key}`;
      res.json({
        uploadUrl: url,
        publicUrl: url,
        key,
        method: 'PUT',
        expiresIn: 3600,
      });
    } else {
      // Fallback: retornar URL pro upload direto
      res.json({
        uploadUrl: `/uploads`,
        publicUrl: `/uploads/${key}`,
        key,
        method: 'POST',
        fields: { filename: key },
      });
    }
  } catch (err) { next(err); }
});

// Servir arquivos estáticos
router.use('/uploads', requireAuth, serveStatic(UPLOAD_DIR));

export default router;

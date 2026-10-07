import { Router } from 'express';
import { createReport, deleteReport, listReports, updateReport } from '../controllers/report.controller.js';
import { authenticate } from '../middleware/authenticate.middleware.js';
import { upload } from '../middleware/upload.js';

export const reportRouter = Router();

reportRouter.get('/', authenticate, listReports);

// TODO v4.5 1 (Sección 1): upload.single('evidence') recibía una sola imagen en request.file.
// TODO 7 (Sección 2): upload.array('evidence', 5) acepta hasta 5 imágenes con el mismo
// nombre de campo y las deja disponibles en request.files.
reportRouter.post(
  '/',
  authenticate,
  upload.array('evidence', 5),
  createReport
);

// TODO 11 (Sección 3): PATCH modifica parcialmente un Report existente (reason, description, status).
reportRouter.patch(
  '/:id',
  authenticate,
  updateReport
);

// TODO 14 (Sección 4): DELETE elimina un Report del usuario autenticado.
reportRouter.delete(
  '/:id',
  authenticate,
  deleteReport
);

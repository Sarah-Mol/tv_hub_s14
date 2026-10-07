import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import { Channel } from '../models/channel.model.js';
import { Report, reportReasons, reportStatuses } from '../models/report.model.js';
import { reportUploadsDirectory } from '../middleware/upload.js';
import { AppError } from '../utils/app-error.js';

function getUserId(request: Parameters<RequestHandler>[0]): string {
  if (!request.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  return request.auth.userId;
}

function readRequiredText(value: unknown, code: string, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, code, message);
  return value.trim();
}

function readReason(value: unknown): string {
  const reason = readRequiredText(value, 'INVALID_REPORT_REASON', 'Report reason is invalid');
  if (!reportReasons.includes(reason as (typeof reportReasons)[number])) {
    throw new AppError(400, 'INVALID_REPORT_REASON', 'Report reason is invalid');
  }
  return reason;
}

function readDescription(value: unknown): string {
  const description = readRequiredText(value, 'INVALID_REPORT_DESCRIPTION', 'Description is required');
  if (description.length > 1000) {
    throw new AppError(400, 'INVALID_REPORT_DESCRIPTION', 'Description must be 1000 characters or fewer');
  }
  return description;
}

function readStatus(value: unknown): string {
  const status = readRequiredText(value, 'INVALID_REPORT_STATUS', 'Report status is invalid');
  if (!reportStatuses.includes(status as (typeof reportStatuses)[number])) {
    throw new AppError(400, 'INVALID_REPORT_STATUS', 'Report status is invalid');
  }
  return status;
}

function readReportId(value: unknown): string {
  if (typeof value !== 'string' || !isValidObjectId(value)) {
    throw new AppError(400, 'INVALID_REPORT_ID', 'Report id is invalid');
  }
  return value;
}

function getUploadedFiles(request: Parameters<RequestHandler>[0]): Express.Multer.File[] {
  return Array.isArray(request.files) ? request.files : [];
}

async function removeUploadedEvidence(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
}

// Reto adicional de la Sección 4: convertir cada URL pública (/uploads/reports/x.png)
// nuevamente en una ruta del filesystem y borrar el archivo físico.
async function removeStoredEvidence(evidenceUrls: string[]): Promise<void> {
  await Promise.all(
    evidenceUrls.map((url) => {
      const fileName = path.basename(url);
      return unlink(path.join(reportUploadsDirectory, fileName)).catch(() => undefined);
    })
  );
}

export const createReport: RequestHandler = async (request, response) => {
  // TODO 9 (Sección 2): con upload.array() Multer deja los archivos en request.files.
  const files = getUploadedFiles(request);

  try {
    const userId = getUserId(request);
    const channelId = readRequiredText(request.body.channelId, 'INVALID_CHANNEL_ID', 'Channel id is invalid');
    if (!isValidObjectId(channelId)) throw new AppError(400, 'INVALID_CHANNEL_ID', 'Channel id is invalid');

    const reason = readReason(request.body.reason);
    const description = readDescription(request.body.description);

    const channel = await Channel.findOne({ _id: channelId, isActive: true });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel was not found');

    // TODO v4.5 2 (Sección 1): `/uploads/reports/${file.filename}` construía evidenceUrl.
    // TODO 9 (Sección 2): ahora cada archivo se transforma en su URL usando file.filename.
    const evidenceUrls = files.map((file) => `/uploads/reports/${file.filename}`);

    // TODO v4.5 3: Report.create() persiste el documento con status OPEN por defecto.
    const report = await Report.create({
      userId,
      channelId,
      reason,
      description,
      evidenceUrls
    });

    response.status(201).json({ report });
  } catch (error) {
    await removeUploadedEvidence(files);
    throw error;
  }
};

export const listReports: RequestHandler = async (request, response) => {
  // TODO v4.5 6: Report.find() filtrado por el userId autenticado, del más reciente al más antiguo.
  const reports = await Report.find({ userId: getUserId(request) })
    .populate('channelId', 'name')
    .sort('-createdAt');

  response.json({ reports });
};

export const updateReport: RequestHandler = async (request, response) => {
  const userId = getUserId(request);
  const reportId = readReportId(request.params.id);

  const reason = readReason(request.body?.reason);
  const description = readDescription(request.body?.description);
  const status = readStatus(request.body?.status);

  // TODO 12 (Sección 3): se filtra por _id y userId para no modificar Reports de otros usuarios.
  const report = await Report.findOneAndUpdate(
    {
      _id: reportId,
      userId
    },
    {
      reason,
      description,
      status
    },
    {
      new: true,
      runValidators: true
    }
  ).populate('channelId', 'name');

  if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'Report was not found');

  response.json({ report });
};

export const deleteReport: RequestHandler = async (request, response) => {
  const userId = getUserId(request);
  const reportId = readReportId(request.params.id);

  // TODO 15 (Sección 4): solo se elimina si el Report pertenece al usuario autenticado.
  const report = await Report.findOneAndDelete({
    _id: reportId,
    userId
  });

  if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'Report was not found');

  // Borrar el documento no borra las imágenes: se eliminan explícitamente del storage local.
  await removeStoredEvidence(report.evidenceUrls);

  response.status(204).send();
};

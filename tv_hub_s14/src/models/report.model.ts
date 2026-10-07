import { model, Schema } from 'mongoose';

export const reportReasons = [
  'STREAM_DOES_NOT_LOAD',
  'WRONG_CHANNEL',
  'AUDIO_PROBLEM',
  'VIDEO_PROBLEM',
  'OTHER'
] as const;

// Estados disponibles para que el usuario pueda modificar su Report con PATCH (Sección 3).
export const reportStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;

const reportSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    reason: { type: String, enum: reportReasons, required: true },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    // TODO 8 (Sección 2): antes evidenceUrl: { type: String }.
    // Ahora un Report guarda una lista de referencias a las imágenes almacenadas en uploads/reports.
    evidenceUrls: { type: [String], default: [] },
    status: { type: String, enum: reportStatuses, required: true, default: 'OPEN' }
  },
  { timestamps: true }
);

export const Report = model('Report', reportSchema);

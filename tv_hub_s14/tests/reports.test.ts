import { readdir, unlink } from 'node:fs/promises';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app } from '../src/app.js';
import { Channel } from '../src/models/channel.model.js';
import { Report } from '../src/models/report.model.js';
import { Session } from '../src/models/session.model.js';
import { User } from '../src/models/user.model.js';
import { reportUploadsDirectory } from '../src/middleware/upload.js';

let mongo: MongoMemoryServer;
let channelId: string;

async function registerAgent(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email, password: 'StrongPass123!' }).expect(201);
  return agent;
}

async function clearUploadedEvidence() {
  const names = await readdir(reportUploadsDirectory);
  await Promise.all(names.filter((name) => name !== '.gitkeep').map((name) => unlink(`${reportUploadsDirectory}/${name}`)));
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  await Report.deleteMany({});
  await Session.deleteMany({});
  await User.deleteMany({});
  await Channel.deleteMany({});
  await clearUploadedEvidence();

  const channel = await Channel.create({
    name: 'Report Channel',
    logoUrl: 'https://example.com/logo.png',
    streamUrl: 'https://example.com/stream.m3u8',
    country: 'Mexico',
    categories: ['News'],
    isActive: true
  });
  channelId = channel.id;
});

afterAll(async () => {
  await clearUploadedEvidence();
  await mongoose.disconnect();
  await mongo.stop();
});

test('reports require authentication', async () => {
  await request(app).get('/api/reports').expect(401);
  await request(app).post('/api/reports').expect(401);
});

test('an authenticated user can create and list a report', async () => {
  const agent = await registerAgent('reporter@example.com');

  const created = await agent.post('/api/reports').field({
    channelId,
    reason: 'AUDIO_PROBLEM',
    description: 'The channel has no sound.'
  }).expect(201);

  expect(created.body.report).toEqual(expect.objectContaining({
    channelId,
    reason: 'AUDIO_PROBLEM',
    description: 'The channel has no sound.',
    status: 'OPEN'
  }));

  const listed = await agent.get('/api/reports').expect(200);
  expect(listed.body.reports).toHaveLength(1);
  expect(listed.body.reports[0].channelId).toEqual(expect.objectContaining({ name: 'Report Channel' }));
});

test('an image evidence file is stored and exposed through its URL', async () => {
  const agent = await registerAgent('image@example.com');
  const created = await agent.post('/api/reports').field({
    channelId,
    reason: 'VIDEO_PROBLEM',
    description: 'The image is frozen.'
  }).attach('evidence', Buffer.from('image evidence'), { filename: 'evidence.png', contentType: 'image/png' }).expect(201);

  expect(created.body.report.evidenceUrls).toHaveLength(1);
  expect(created.body.report.evidenceUrls[0]).toMatch(/^\/uploads\/reports\/.+\.png$/);
  await request(app).get(created.body.report.evidenceUrls[0]).expect(200);
});

test('reports reject invalid report data and invalid files', async () => {
  const agent = await registerAgent('validation@example.com');
  await agent.post('/api/reports').field({ channelId, reason: 'NOT_A_REASON', description: 'A valid description.' }).expect(400, {
    error: { code: 'INVALID_REPORT_REASON', message: 'Report reason is invalid' }
  });
  await agent.post('/api/reports').field({ channelId, reason: 'OTHER', description: '' }).expect(400, {
    error: { code: 'INVALID_REPORT_DESCRIPTION', message: 'Description is required' }
  });
  await agent.post('/api/reports').field({ channelId, reason: 'OTHER', description: 'Text evidence is invalid.' })
    .attach('evidence', Buffer.from('not an image'), { filename: 'evidence.txt', contentType: 'text/plain' })
    .expect(400, { error: { code: 'INVALID_EVIDENCE_FILE', message: 'Evidence must be an image file' } });
  await agent.post('/api/reports').field({ channelId, reason: 'OTHER', description: 'Large evidence is invalid.' })
    .attach('evidence', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' })
    .expect(400, { error: { code: 'UPLOAD_ERROR', message: 'Evidence image must be 2 MB or smaller' } });
});

test('reports only list the current user reports', async () => {
  const firstUser = await registerAgent('first@example.com');
  const secondUser = await registerAgent('second@example.com');
  await firstUser.post('/api/reports').field({ channelId, reason: 'OTHER', description: 'First report.' }).expect(201);
  await secondUser.post('/api/reports').field({ channelId, reason: 'OTHER', description: 'Second report.' }).expect(201);

  const listed = await firstUser.get('/api/reports').expect(200);
  expect(listed.body.reports).toHaveLength(1);
  expect(listed.body.reports[0].description).toBe('First report.');
});

test('a report can store up to five evidence images', async () => {
  const agent = await registerAgent('multiple@example.com');
  const created = await agent.post('/api/reports').field({ channelId, reason: 'VIDEO_PROBLEM', description: 'Several screenshots.' })
    .attach('evidence', Buffer.from('one'), { filename: 'one.png', contentType: 'image/png' })
    .attach('evidence', Buffer.from('two'), { filename: 'two.jpg', contentType: 'image/jpeg' })
    .attach('evidence', Buffer.from('three'), { filename: 'three.webp', contentType: 'image/webp' })
    .expect(201);

  expect(created.body.report.evidenceUrls).toHaveLength(3);
  const stored = await Report.findById(created.body.report._id);
  expect(stored?.evidenceUrls).toHaveLength(3);

  const tooMany = agent.post('/api/reports').field({ channelId, reason: 'OTHER', description: 'Too many images.' });
  for (let index = 0; index < 6; index += 1) {
    tooMany.attach('evidence', Buffer.from(`image ${index}`), { filename: `image-${index}.png`, contentType: 'image/png' });
  }
  await tooMany.expect(400);
});

test('a user can update only their own report', async () => {
  const owner = await registerAgent('owner@example.com');
  const other = await registerAgent('other@example.com');
  const created = await owner.post('/api/reports').field({ channelId, reason: 'OTHER', description: 'Original.' }).expect(201);
  const reportId = created.body.report._id;

  const updated = await owner.patch(`/api/reports/${reportId}`)
    .send({ reason: 'AUDIO_PROBLEM', description: 'Updated description.', status: 'IN_PROGRESS' })
    .expect(200);
  expect(updated.body.report).toEqual(expect.objectContaining({
    _id: reportId,
    reason: 'AUDIO_PROBLEM',
    description: 'Updated description.',
    status: 'IN_PROGRESS'
  }));
  expect(await Report.countDocuments()).toBe(1);

  await owner.patch(`/api/reports/${reportId}`).send({ reason: 'OTHER', description: 'x', status: 'CLOSED' }).expect(400);
  await other.patch(`/api/reports/${reportId}`).send({ reason: 'OTHER', description: 'Hijack.', status: 'RESOLVED' }).expect(404);
  await owner.patch('/api/reports/not-an-id').send({ reason: 'OTHER', description: 'x', status: 'OPEN' }).expect(400);
});

test('a user can delete only their own report and its evidence files', async () => {
  const owner = await registerAgent('delete-owner@example.com');
  const other = await registerAgent('delete-other@example.com');
  const created = await owner.post('/api/reports').field({ channelId, reason: 'OTHER', description: 'To delete.' })
    .attach('evidence', Buffer.from('image'), { filename: 'delete.png', contentType: 'image/png' })
    .expect(201);
  const reportId = created.body.report._id;
  const fileName = created.body.report.evidenceUrls[0].split('/').pop();

  await other.delete(`/api/reports/${reportId}`).expect(404);
  await owner.delete(`/api/reports/${reportId}`).expect(204);

  expect(await Report.findById(reportId)).toBeNull();
  expect(await readdir(reportUploadsDirectory)).not.toContain(fileName);
  await owner.delete(`/api/reports/${reportId}`).expect(404);
});

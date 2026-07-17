import assert from 'node:assert/strict';
import { buildMediaDerivativeUrl, toPlayableVideoSrc } from './use-presigned-url';

assert.equal(
  buildMediaDerivativeUrl(
    '/api/materials/file/experience-media%2Ftask-1%2Fphoto.jpg?exp=123&token=signed-token',
    'thumb',
  ),
  '/api/materials/thumb/experience-media/task-1/photo.jpg?exp=123&token=signed-token',
);

assert.equal(
  buildMediaDerivativeUrl(
    'https://example.test/api/materials/file/experience-media%2Ftask-1%2Fclip.mp4?token=signed-token&exp=123',
    'poster',
  ),
  '/api/materials/poster/experience-media/task-1/clip.mp4?token=signed-token&exp=123',
);

assert.equal(
  buildMediaDerivativeUrl('/uploads/experience-media/task-1/photo.jpg', 'thumb'),
  '/api/materials/thumb/experience-media/task-1/photo.jpg',
);

assert.equal(buildMediaDerivativeUrl('https://cdn.example.test/photo.jpg', 'thumb'), null);

assert.equal(
  toPlayableVideoSrc('/api/materials/file/experience-media%2Ftask-1%2Fclip.mp4?token=signed-token&exp=123', 'https://example.test'),
  '/api/materials/file/experience-media%2Ftask-1%2Fclip.mp4?token=signed-token&exp=123',
);

console.log('media derivative URL tests passed');

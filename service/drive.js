const { google } = require('googleapis');
require('dotenv').config();
const stream = require('stream');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  access_token: process.env.GOOGLE_DRIVE_ACCESS_TOKEN,
  refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function findOrCreateFolder(name, parentId = null) {
  // Search for folder with this name and parent
  const q = [
    `mimeType='application/vnd.google-apps.folder'`,
    `name='${name.replace(/'/g, "\\'")}'`,
    'trashed=false',
    parentId ? `'${parentId}' in parents` : null,
  ]
    .filter(Boolean)
    .join(' and ');

  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id;
  } else {
    // Create folder
    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId && { parents: [parentId] }),
    };
    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });
    return folder.data.id;
  }
}

/**
 * Upload a file buffer to Google Drive in a nested folder structure
 * @param {Object} options
 * @param {Buffer} options.buffer - File buffer
 * @param {string} options.originalname - File name
 * @param {string} options.mimetype - File MIME type
 * @param {string} options.folder - Folder path as "parent/child"
 */
async function uploadFile({ buffer, originalname, mimetype, folder }) {
  let parentId = null;
  if (folder) {
    const parts = folder.split('/');
    // Find or create parent, then subfolder
    parentId = await findOrCreateFolder(parts[0]);
    if (parts[1]) {
      parentId = await findOrCreateFolder(parts[1], parentId);
    }
  }

  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const fileMetadata = {
    name: originalname,
    ...(parentId && { parents: [parentId] }),
  };

  const media = {
    mimeType: mimetype,
    body: bufferStream,
  };

  const response = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, name, webViewLink, webContentLink',
  });

  return {
    fileId: response.data.id,
    fileName: response.data.name,
    webViewLink: response.data.webViewLink,
    webContentLink: response.data.webContentLink,
    parentFolderId: parentId || null,
    folderWebViewLink: parentId ? `https://drive.google.com/drive/folders/${parentId}` : null,
  };
}

async function getFileMetadata(fileId) {
  const res = await drive.files.get({
    fileId,
    fields:
      'id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,parents',
  });
  return res.data;
}

// Delete a file permanently
async function deleteFile(fileId) {
  await drive.files.delete({ fileId });
  return { deleted: true };
}

async function getFolderIdByPath(path) {
  const parts = (path || '').split('/').filter(Boolean);
  if (parts.length === 0) throw new Error('Invalid folder path');
  let parentId = await findOrCreateFolder(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    parentId = await findOrCreateFolder(parts[i], parentId);
  }
  return parentId;
}

async function listFilesInFolderByPath(path) {
  const folderId = await getFolderIdByPath(path);
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields:
      'files(id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,webViewLink,webContentLink,parents)',
    spaces: 'drive',
    pageSize: 1000,
  });
  return { folderId, folderWebViewLink: `https://drive.google.com/drive/folders/${folderId}`, files: res.data.files || [] };
}

module.exports = { uploadFile, getFileMetadata, deleteFile, listFilesInFolderByPath };
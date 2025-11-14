const cloudinary = require('../service/cloudinary');
const { uploadFile } = require('../service/drive');
const streamifier = require('streamifier');
const { getValuesFromToken } = require('../service/jwt');
const crypto = require('crypto');

// unchanged Cloudinary upload
exports.upToCloudinary = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided.' });
        }
        const streamUpload = (buffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { resource_type: 'auto' },
                    (error, result) => {
                        if (result) resolve(result);
                        else reject(error);
                    }
                );
                streamifier.createReadStream(buffer).pipe(stream);
            });
        };
        const result = await streamUpload(req.file.buffer);
        res.status(200).json({
            message: 'Image uploaded successfully!',
            imageUrl: result.secure_url,
            publicId: result.public_id
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ message: 'Image upload failed.' });
    }
};

// Helper for Google Drive uploads with parent and user subfolder
async function uploadFilesToDriveWithParent(files, parentFolder, username) {
  const results = [];
  const folderPath = `${parentFolder}/${username}`;

  // List existing files to dedupe
  const { folderId, folderWebViewLink, files: existing } = await listFilesInFolderByPath(folderPath);
  const byHash = new Map();
  const byNameSize = new Map();
  for (const f of existing) {
    if (f.md5Checksum) byHash.set(f.md5Checksum, f);
    byNameSize.set(`${f.name}#${f.size || 0}`, f);
  }

  const seenHashes = new Set(); // dedupe within the same request

  for (const file of files) {
    const buf = file.buffer;
    const hash = crypto.createHash('md5').update(buf).digest('hex');
    const key = `${file.originalname}#${buf?.length || 0}`;

    // Exact match in Drive by md5 or name+size
    const match = byHash.get(hash) || byNameSize.get(key);
    if (match) {
      results.push({
        fileId: match.id,
        fileName: match.name,
        webViewLink: match.webViewLink,
        webContentLink: match.webContentLink,
        parentFolderId: folderId,
        folderWebViewLink,
        deduped: true,
      });
      continue;
    }

    // Duplicate in the same batch
    if (seenHashes.has(hash)) {
      results.push({
        fileId: null,
        fileName: file.originalname,
        webViewLink: null,
        webContentLink: null,
        parentFolderId: folderId,
        folderWebViewLink,
        deduped: true,
        skippedReason: 'duplicate-in-same-batch',
      });
      continue;
    }
    seenHashes.add(hash);

    // Upload unique file
    const uploadResult = await uploadFile({
      buffer: buf,
      originalname: file.originalname,
      mimetype: file.mimetype,
      folder: folderPath,
    });
    results.push(uploadResult);
  }

  return { results, folderPath, folderWebViewLink, folderId };
}

// Mentor credentials upload
exports.uploadMentorCredentials = async (req, res) => {
  try {
    const user = getValuesFromToken(req, res);
    const username = user?.username || 'unknown_user';
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files provided.' });
    }
    const { results, folderPath, folderWebViewLink, folderId } =
      await uploadFilesToDriveWithParent(req.files, 'mentor_credentials', username);

    const folderUrl = folderWebViewLink || (folderId ? `https://drive.google.com/drive/folders/${folderId}` : null);

    res.status(200).json({
      message: 'Mentor credentials uploaded successfully!',
      files: results,
      folderPath,
      folderUrl
    });
  } catch (error) {
    console.error('Error uploading mentor credentials:', error);
    res.status(500).json({ message: 'Mentor credentials upload failed.' });
  }
};

// Mentor learning materials upload
exports.uploadLearningMaterials = async (req, res) => {
    try {
        const user = getValuesFromToken(req, res);
        const username = user?.username || 'unknown_user';
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files provided.' });
        }
        // Parent folder: "learning_materials", subfolder: username
        const { results, folderPath, folderWebViewLink } = await uploadFilesToDriveWithParent(req.files, 'learning_materials', username);

        let folderUrl = null;
        if (results.length > 0 && results[0].parentFolderId) {
            folderUrl = `https://drive.google.com/drive/folders/${results[0].parentFolderId}`;
        } else if (folderWebViewLink) {
            folderUrl = folderWebViewLink;
        }

        res.status(200).json({
            message: 'Learning materials uploaded successfully!',
            files: results,
            folderPath,
            folderUrl
        });
    } catch (error) {
        console.error('Error uploading learning materials:', error);
        res.status(500).json({ message: 'Learning materials upload failed.' });
    }
};

// New: simple helpers used by mentor controller
const { getFileMetadata, deleteFile, listFilesInFolderByPath } = require('../service/drive');

// New: list files for a user under a parent folder (e.g., "learning_materials/{username}")
exports.listDriveFilesForUser = async (username, parentFolder = 'learning_materials') => {
  if (!username) throw new Error('username is required');
  const folderPath = `${parentFolder}/${username}`;
  const { folderId, files } = await listFilesInFolderByPath(folderPath);
  return { folderId, folderPath, files };
};

exports.getDriveFileMetadata = async (fileId) => {
  if (!fileId) throw new Error('fileId is required');
  return await getFileMetadata(fileId);
};

exports.deleteDriveFile = async (fileId) => {
  if (!fileId) throw new Error('fileId is required');
  await deleteFile(fileId);
  return { deleted: true };
};
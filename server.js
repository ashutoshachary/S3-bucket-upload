// server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const path = require('path');
const { S3Client, PutObjectCommand, ListObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// AWS Configuration with SDK v3
const s3Client = new S3Client({
  region: 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  }
});

// Multer configuration for temporary file storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Route to get presigned URL
app.post('/api/upload/get-presigned-url', async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: fileName,
      ContentType: fileType
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    
    res.json({
      presignedUrl,
      fileUrl: `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`
    });
  } catch (error) {
    console.error('Presigned URL error:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL' });
  }
});

// Direct upload endpoint (alternative to presigned URLs)
app.post('/api/upload/direct', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const fileName = `${Date.now()}_${path.basename(req.file.originalname)}`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: 'public-read'
    });

    await s3Client.send(command);
    
    res.json({
      success: true,
      fileUrl: `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Utility endpoint to get file list
app.get('/api/files', async (req, res) => {
  try {
    const command = new ListObjectsCommand({
      Bucket: process.env.S3_BUCKET
    });

    const data = await s3Client.send(command);
    
    const files = data.Contents.map(file => ({
      name: file.Key,
      url: `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${file.Key}`,
      lastModified: file.LastModified
    }));

    res.json(files);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
import express from 'express';
import ShowcaseVideo from '../models/ShowcaseVideo.js';
import Product from '../models/Product.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
// import { authenticate, isAdmin } from '../middleware/auth.js'; // Uncomment if you want to protect routes

const router = express.Router();

// Multer setup for memory storage (buffer only)
const upload = multer({ storage: multer.memoryStorage() });

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Log Cloudinary config status
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  console.log('Cloudinary credentials loaded:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET ? '***' : undefined
  });
  cloudinary.api.ping((error, result) => {
    if (error) {
      console.error('Cloudinary connection failed:', error);
    } else {
      console.log('Cloudinary connection successful:', result);
    }
  });
} else {
  console.error('Cloudinary credentials missing in environment variables.');
}

// POST /upload - upload a showcase video file to Cloudinary
router.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  try {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'video', folder: 'showcase-videos' },
      (error, result) => {
        if (error) {
          return res.status(500).json({ error: 'Cloudinary upload error', details: error });
        }
        res.json({ url: result.secure_url });
      }
    );
    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET all showcase videos (sorted by displayOrder)
router.get('/', async (req, res) => {
  try {
    const videos = await ShowcaseVideo.find().sort({ displayOrder: 1, createdAt: -1 }).populate('productId');
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create new showcase video
router.post('/', async (req, res) => {
  try {
    const { name, videoUrl, productId } = req.body;
    const count = await ShowcaseVideo.countDocuments();
    const video = new ShowcaseVideo({ name, videoUrl, productId, displayOrder: count });
    const saved = await video.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /reorder - get all showcase videos sorted by displayOrder (for debugging/admin)
router.get('/reorder', async (req, res) => {
  try {
    const videos = await ShowcaseVideo.find().sort({ displayOrder: 1, createdAt: -1 }).populate('productId');
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /reorder - update the displayOrder of showcase videos
router.put('/reorder', async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || order.some(item => !item._id || typeof item.displayOrder !== 'number')) {
      return res.status(400).json({ error: 'Invalid payload: order must be an array of {_id, displayOrder}' });
    }
    // Update each video's displayOrder
    const updates = await Promise.all(order.map(item =>
      ShowcaseVideo.findByIdAndUpdate(item._id, { displayOrder: item.displayOrder })
    ));
    if (updates.some(u => !u)) {
      return res.status(404).json({ error: 'One or more videos not found' });
    }
    res.json({ message: 'Order updated' });
  } catch (err) {
    console.error('Error in /reorder:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update showcase video by ID
router.put('/:id', async (req, res) => {
  try {
    const { name, videoUrl, productId } = req.body;
    const updated = await ShowcaseVideo.findByIdAndUpdate(
      req.params.id,
      { name, videoUrl, productId },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE showcase video
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await ShowcaseVideo.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router; 
import express from 'express';
import ShowcaseVideo from '../models/ShowcaseVideo.js';
import Product from '../models/Product.js';
import multer from 'multer';
import path from 'path';
// import { authenticate, isAdmin } from '../middleware/auth.js'; // Uncomment if you want to protect routes

const router = express.Router();

// Multer setup for video uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), 'uploads/showcase-videos'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// POST /upload - upload a showcase video file
router.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const url = `/uploads/showcase-videos/${req.file.filename}`;
  res.json({ url });
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
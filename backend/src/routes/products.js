import express from 'express';
import Product from '../models/Product.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';

const router = express.Router();

// Multer setup for memory storage (buffer only)
const upload = multer({ storage: multer.memoryStorage() });

// Cloudinary config
cloudinary.config({
  cloud_name: 'Untitled',
  api_key: 'RTmCaqWE-VY-rU3cOZNPF97lMIk',
  api_secret: 'RTmCaqWE-VY-rU3cOZNPF97lMIk'
});

// GET all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ displayOrder: 1, createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create new product
router.post('/', async (req, res) => {
  try {
    const product = new Product(req.body);
    const savedProduct = await product.save();
    console.log('Product created:', savedProduct); // Log for confirmation
    res.status(201).json(savedProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update product
router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE product
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET products by category, with optional exclusion of a product by ID (for recommendations)
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { exclude } = req.query;
    const filter = { category };
    if (exclude) {
      filter._id = { $ne: exclude };
    }
    const products = await Product.find(filter).sort({ displayOrder: 1, createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Image upload endpoint to Cloudinary
router.post('/upload', upload.array('images', 10), async (req, res) => {
  if (!req.files || !Array.isArray(req.files)) {
    return res.status(400).json({ message: 'No files uploaded' });
  }
  try {
    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'image', folder: 'product-images' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
          }
        );
        streamifier.createReadStream(file.buffer).pipe(uploadStream);
      });
    });
    const urls = await Promise.all(uploadPromises);
    res.json({ urls });
  } catch (err) {
    res.status(500).json({ error: 'Cloudinary upload error', details: err });
  }
});

export default router;

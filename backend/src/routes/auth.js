import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js'; // Import the correct middleware
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// Register route
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword, name: req.body.name || email.split('@')[0] });
    await user.save();
    
    const userForToken = { _id: user._id, name: user.name, email: user.email, customerDetails: user.customerDetails, wishlist: user.wishlist, role: user.role };
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' }); // Corrected secret
    
    res.status(201).json({ 
      message: 'User created successfully', 
      token,
      user: userForToken
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Check if credentials match admin from env
    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const adminUser = {
        _id: 'admin',
        name: 'Admin',
        email: process.env.ADMIN_EMAIL,
        role: 'admin',
        wishlist: [],
        customerDetails: {},
      };
      const token = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
      return res.status(200).json({
        message: 'Admin login successful',
        token,
        user: adminUser,
      });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    const userForToken = { _id: user._id, name: user.name, email: user.email, customerDetails: user.customerDetails, wishlist: user.wishlist, role: user.role };

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' }); // Corrected secret
    
    res.status(200).json({ 
      message: 'Login successful', 
      token,
      user: userForToken
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile
router.get('/profile', authenticate, async (req, res) => { // Use the correct middleware
  try {
    const user = await User.findById(req.user._id)
                           .select('-password')
                           .populate({
                               path: 'cart.productId',
                               model: 'Product'
                           })
                           .populate('wishlist');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});


export default router;

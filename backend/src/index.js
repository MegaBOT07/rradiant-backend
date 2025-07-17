import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import productsRouter from './routes/products.js';
import authRouter from './routes/auth.js';
import userRouter from './routes/user.js';
import checkoutRouter from './routes/checkout.js';
import adminRouter from './routes/admin.js';
import showcaseRouter from './routes/showcase.js';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors({
  origin: process.env.API_URI || 'https://rradiant-backend.onrender.com/',
  credentials: true,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: 'Origin,X-Requested-With,Content-Type,Accept,Authorization'
}));
app.use(express.json());

// Serve uploads folder statically
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.use('/api/products', productsRouter);
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/admin', adminRouter);
app.use('/api/showcase', showcaseRouter);

app.get('/', (req, res) => {
  res.send('RRJewel Backend API');
});

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rrjewel')
.then(() => {
  console.log('Connected to MongoDB');
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
});


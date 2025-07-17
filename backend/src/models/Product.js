import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  originalPrice: { type: Number },
  image: { type: String, required: true },
  images: [String],
  sale: { type: Boolean, default: false },
  soldOut: { type: Boolean, default: false },
  category: { type: String, required: true },
  description: { type: String, required: true },
  features: [String],
  materials: [String],
  dimensions: { type: String },
  weight: { type: String },
  careInstructions: [String],
  displayOrder: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Product', ProductSchema);

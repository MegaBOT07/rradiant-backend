import mongoose from 'mongoose';

const ShowcaseVideoSchema = new mongoose.Schema({
  name: { type: String, required: true },
  videoUrl: { type: String, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  displayOrder: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('ShowcaseVideo', ShowcaseVideoSchema); 
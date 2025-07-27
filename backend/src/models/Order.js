import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  name: { type: String, required: true },
  image: { type: String, required: true },
});

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  orderNumber: { type: String, required: true, unique: true },
  items: [orderItemSchema],
  totalAmount: { type: Number, required: true },
  customerDetails: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
  },
  paymentId: { type: String },
  paymentStatus: { type: String, default: 'Pending' }, // e.g., 'Pending', 'Paid', 'Failed'
  orderStatus: { 
    type: String, 
    default: 'Pending', 
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] 
  },
  trackingNumber: { type: String },
  carrier: { type: String },
  trackingUrl: { type: String },
  shiprocketShipmentId: { type: String },
  shiprocketOrderId: { type: String },
  statusHistory: [{
    status: { type: String },
    timestamp: { type: Date, default: Date.now },
    location: { type: String },
    comment: { type: String }
  }],
}, { timestamps: true });

export default mongoose.model('Order', orderSchema); 
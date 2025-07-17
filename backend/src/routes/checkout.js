import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { authenticate } from '../middleware/auth.js';
import { createShiprocketOrder } from '../services/shiprocket.js';

const router = express.Router();

// Initialize Razorpay with credentials from environment variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
console.log('Razorpay instance initialized with env credentials.');

// Test route to check if checkout routes are working
router.get('/test', (req, res) => {
  res.json({ message: 'Checkout routes are working' });
});

// Create Razorpay order
router.post('/create-order', authenticate, async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({ 
      message: 'Payment gateway not configured.' 
    });
  }

  const { cart, totalAmount, customerDetails } = req.body;
  console.log('Received request to /create-order:');
  console.log('Total Amount:', totalAmount);
  console.log('Customer Details:', customerDetails);
  
  const options = {
    amount: totalAmount * 100, // amount in the smallest currency unit
    currency: "INR",
    receipt: `receipt_order_${new Date().getTime()}`
  };

  try {
    const order = await razorpay.orders.create(options);
    
    // Generate orderNumber (same logic as COD)
    const uniqueId = Date.now();
    const orderNumber = uniqueId.toString().slice(-6); // A simple, likely-unique order number

    // Create an order in our database with pending status
    const newOrder = new Order({
      orderId: order.id, // Use Razorpay order ID
      orderNumber, // Add the new order number here
      items: cart.map(item => ({
        productId: item._id,
        quantity: item.quantity,
        price: item.price,
        name: item.name,
        image: item.image,
      })),
      totalAmount,
      customerDetails,
      paymentStatus: 'Pending',
    });

    await newOrder.save();

    // Shiprocket API integration
    try {
      const shiprocketOrderData = {
        order_id: newOrder.orderId,
        order_date: new Date().toISOString().slice(0, 10),
        pickup_location: "Default", // Change to your Shiprocket pickup location name
        billing_customer_name: customerDetails.name,
        billing_last_name: "", // Not collected
        billing_address: customerDetails.address,
        billing_city: customerDetails.city,
        billing_pincode: customerDetails.zip,
        billing_state: customerDetails.state,
        billing_country: "India",
        billing_email: customerDetails.email,
        billing_phone: customerDetails.phone,
        shipping_is_billing: true,
        order_items: newOrder.items.map(item => ({
          name: item.name,
          sku: item.productId.toString(),
          units: item.quantity,
          selling_price: item.price,
        })),
        payment_method: newOrder.paymentId === 'COD' ? 'COD' : 'Prepaid',
        sub_total: newOrder.totalAmount,
        length: 10, // Default, update as needed
        breadth: 10,
        height: 10,
        weight: 0.5, // Default, update as needed
      };
      const shiprocketRes = await createShiprocketOrder(shiprocketOrderData);
      newOrder.trackingNumber = shiprocketRes.awb_code || shiprocketRes.data?.awb_code;
      newOrder.carrier = shiprocketRes.courier_company_id || shiprocketRes.data?.courier_company_id;
      newOrder.trackingUrl = shiprocketRes.shipment_id ? `https://app.shiprocket.in/orders/${shiprocketRes.shipment_id}` : '';
      newOrder.shiprocketShipmentId = shiprocketRes.shipment_id || shiprocketRes.data?.shipment_id;
      await newOrder.save();
    } catch (err) {
      console.error('Shiprocket order creation failed:', err?.response?.data || err);
    }

    res.json({ ...order, trackingNumber: newOrder.trackingNumber, carrier: newOrder.carrier, trackingUrl: newOrder.trackingUrl, key_id: razorpay.key_id }); // Send order + tracking + key_id to frontend
  } catch (error) {
    console.error('--- Error Creating Razorpay Order ---');
    console.error('Message:', error.message);
    if (error.error) {
      console.error('Razorpay Error Code:', error.error.code);
      console.error('Razorpay Error Description:', error.error.description);
    }
    console.error('Full Error Object:', error);
    console.error('------------------------------------');
    res.status(500).json({ message: 'Server error' });
  }
});

// Create COD order
router.post('/create-cod-order', authenticate, async (req, res) => {
  const { cart, totalAmount, customerDetails } = req.body;
  const uniqueId = Date.now();
  const orderId = `COD-${uniqueId}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  const orderNumber = uniqueId.toString().slice(-6); // A simple, likely-unique order number

  try {
    const newOrder = new Order({
      orderId,
      orderNumber, // Add the new order number here
      items: cart.map(item => ({
        productId: item._id,
        quantity: item.quantity,
        price: item.price,
        name: item.name,
        image: item.image,
      })),
      totalAmount,
      customerDetails,
      paymentStatus: 'Pending',
      paymentId: 'COD' // Indicate Cash on Delivery
    });

    await newOrder.save();
    
    // Shiprocket API integration
    try {
      const shiprocketOrderData = {
        order_id: newOrder.orderId,
        order_date: new Date().toISOString().slice(0, 10),
        pickup_location: "Default", // Change to your Shiprocket pickup location name
        billing_customer_name: customerDetails.name,
        billing_last_name: "", // Not collected
        billing_address: customerDetails.address,
        billing_city: customerDetails.city,
        billing_pincode: customerDetails.zip,
        billing_state: customerDetails.state,
        billing_country: "India",
        billing_email: customerDetails.email,
        billing_phone: customerDetails.phone,
        shipping_is_billing: true,
        order_items: newOrder.items.map(item => ({
          name: item.name,
          sku: item.productId.toString(),
          units: item.quantity,
          selling_price: item.price,
        })),
        payment_method: newOrder.paymentId === 'COD' ? 'COD' : 'Prepaid',
        sub_total: newOrder.totalAmount,
        length: 10, // Default, update as needed
        breadth: 10,
        height: 10,
        weight: 0.5, // Default, update as needed
      };
      const shiprocketRes = await createShiprocketOrder(shiprocketOrderData);
      newOrder.trackingNumber = shiprocketRes.awb_code || shiprocketRes.data?.awb_code;
      newOrder.carrier = shiprocketRes.courier_company_id || shiprocketRes.data?.courier_company_id;
      newOrder.trackingUrl = shiprocketRes.shipment_id ? `https://app.shiprocket.in/orders/${shiprocketRes.shipment_id}` : '';
      newOrder.shiprocketShipmentId = shiprocketRes.shipment_id || shiprocketRes.data?.shipment_id;
      await newOrder.save();
    } catch (err) {
      console.error('Shiprocket order creation failed:', err?.response?.data || err);
    }

    // Reduce stock
    for (const item of newOrder.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity }
      });
    }

    res.json({ status: 'success', orderId, trackingNumber: newOrder.trackingNumber, carrier: newOrder.carrier, trackingUrl: newOrder.trackingUrl });
  } catch (error) {
    console.error('Error creating COD order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify payment
router.post('/verify', async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({ 
      message: 'Payment gateway not configured. Please set up Razorpay credentials.' 
    });
  }

  // Debug: Log the request body received for verification
  console.log('Received at /verify:', req.body);

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const secret = process.env.RAZORPAY_KEY_SECRET;

  const shasum = crypto.createHmac('sha256', secret);
  shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const digest = shasum.digest('hex');

  if (digest === razorpay_signature) {
    try {
      const updatedOrder = await Order.findOneAndUpdate(
        { orderId: razorpay_order_id },
        { 
          paymentId: razorpay_payment_id, 
          paymentStatus: 'Paid' 
        },
        { new: true }
      );
      
      if (!updatedOrder) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // Reduce stock
      for (const item of updatedOrder.items) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: -item.quantity }
        });
      }
      
      res.json({ status: 'success', orderId: razorpay_order_id, trackingNumber: updatedOrder.trackingNumber, carrier: updatedOrder.carrier, trackingUrl: updatedOrder.trackingUrl });
    } catch (error) {
      console.error('Error verifying payment and updating order:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  } else {
    res.status(400).json({ status: 'failure' });
  }
});

export default router;

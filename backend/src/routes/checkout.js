import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { authenticate } from '../middleware/auth.js';
import { createShiprocketOrder } from '../services/shiprocket.js';
import { generateUniversalOrderId } from '../utils/orderIdGenerator.js';

const router = express.Router();

// Initialize Razorpay with hardcoded credentials for testing
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID, 
  key_secret: process.env.RAZORPAY_KEY_SECRET, 
});
console.log('Razorpay instance initialized with hardcoded credentials.');

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

  const { totalAmount } = req.body;
  console.log('Received request to /create-order:');
  console.log('Total Amount:', totalAmount);
  
  const options = {
    amount: totalAmount * 100, // amount in the smallest currency unit
    currency: "INR",
    receipt: `receipt_order_${new Date().getTime()}`
  };

  try {
    const order = await razorpay.orders.create(options);
    res.json({ ...order, key_id: razorpay.key_id }); // Only return Razorpay order details
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
  
  // Generate universal order ID
  const universalOrder = generateUniversalOrderId();
  const orderId = universalOrder.orderId;
  const orderNumber = universalOrder.orderNumber;

  try {
    const newOrder = new Order({
      orderId,
      orderNumber,
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
        order_id: orderId, // Use the universal order ID
        order_date: new Date().toISOString().slice(0, 10),
        pickup_location: "gaurav", // Exact match with Shiprocket pickup location name
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
      newOrder.shiprocketOrderId = shiprocketRes.order_id || shiprocketRes.data?.order_id;
      
      // Add initial status to history
      newOrder.statusHistory.push({
        status: 'Pending',
        timestamp: new Date(),
        comment: 'Order placed successfully'
      });
      
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
router.post('/verify', authenticate, async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({ 
      message: 'Payment gateway not configured. Please set up Razorpay credentials.' 
    });
  }

  // Debug: Log the request body received for verification
  console.log('Received at /verify:', req.body);

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, cart, totalAmount, customerDetails } = req.body;
  const secret = process.env.RAZORPAY_KEY_SECRET;

  const shasum = crypto.createHmac('sha256', secret);
  shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const digest = shasum.digest('hex');

  if (digest === razorpay_signature) {
    try {
      // Generate universal order ID
      const universalOrder = generateUniversalOrderId();
      const orderId = universalOrder.orderId;
      const orderNumber = universalOrder.orderNumber;

      // Create the order in DB
      const newOrder = new Order({
        orderId, // Use universal order ID instead of razorpay_order_id
        orderNumber,
        items: cart.map(item => ({
          productId: item._id,
          quantity: item.quantity,
          price: item.price,
          name: item.name,
          image: item.image,
        })),
        totalAmount,
        customerDetails,
        paymentStatus: 'Paid',
        paymentId: razorpay_payment_id, // Keep razorpay payment ID for reference
        razorpayOrderId: razorpay_order_id // Store razorpay order ID separately for reference
      });

      await newOrder.save();

      // Shiprocket API integration
      try {
        const shiprocketOrderData = {
          order_id: orderId, // Use the universal order ID
          order_date: new Date().toISOString().slice(0, 10),
          pickup_location: "gaurav",
          billing_customer_name: customerDetails.name,
          billing_last_name: "",
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
          payment_method: 'Prepaid',
          sub_total: newOrder.totalAmount,
          length: 10,
          breadth: 10,
          height: 10,
          weight: 0.5,
        };
        const shiprocketRes = await createShiprocketOrder(shiprocketOrderData);
        newOrder.trackingNumber = shiprocketRes.awb_code || shiprocketRes.data?.awb_code;
        newOrder.carrier = shiprocketRes.courier_company_id || shiprocketRes.data?.courier_company_id;
        newOrder.trackingUrl = shiprocketRes.shipment_id ? `https://app.shiprocket.in/orders/${shiprocketRes.shipment_id}` : '';
        newOrder.shiprocketShipmentId = shiprocketRes.shipment_id || shiprocketRes.data?.shipment_id;
        newOrder.shiprocketOrderId = shiprocketRes.order_id || shiprocketRes.data?.order_id;
        
        // Add initial status to history
        newOrder.statusHistory.push({
          status: 'Paid',
          timestamp: new Date(),
          comment: 'Payment verified and order confirmed'
        });
        
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

      res.json({ status: 'success', orderId: orderId, orderNumber: orderNumber, trackingNumber: newOrder.trackingNumber, carrier: newOrder.carrier, trackingUrl: newOrder.trackingUrl });
    } catch (error) {
      console.error('Error verifying payment and creating order:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  } else {
    res.status(400).json({ status: 'failure' });
  }
});

export default router;

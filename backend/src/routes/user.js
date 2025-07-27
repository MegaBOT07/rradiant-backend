import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { authenticate as auth } from '../middleware/auth.js'; // Import the correct middleware and alias it
import nodemailer from 'nodemailer';
import { trackShiprocketOrder, cancelShiprocketOrder, syncOrderStatusFromShiprocket } from '../services/shiprocket.js';

const router = express.Router();

// Nodemailer transporter setup (using Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.CONTACT_EMAIL || 'rradiantrefletion666@gmail.com',
    pass: process.env.CONTACT_EMAIL_PASS || 'your-app-password-here', // Use an app password, not your main password
  },
});

// Contact form endpoint
router.post('/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ message: 'All fields are required.' });
  }
  try {
    await transporter.sendMail({
      from: email,
      to: process.env.CONTACT_EMAIL || 'rradiantrefletion666@gmail.com',
      subject: `[Contact Form] ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    });
    res.json({ message: 'Message sent successfully.' });
  } catch (err) {
    console.error('Error sending contact email:', err);
    res.status(500).json({ message: 'Failed to send message.' });
  }
});

// Newsletter subscribe endpoint
router.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }
  try {
    await transporter.sendMail({
      from: email,
      to: process.env.CONTACT_EMAIL || 'rradiantrefletion666@gmail.com',
      subject: '[Newsletter Subscription]',
      text: `Please subscribe this email to the newsletter: ${email}`,
    });
    res.json({ message: 'Subscription request sent successfully.' });
  } catch (err) {
    console.error('Error sending subscription email:', err);
    res.status(500).json({ message: 'Failed to send subscription request.' });
  }
});

// Get user orders
router.get('/orders', auth, async (req, res) => {
  try {
    const orders = await Order.find({ 
      'customerDetails.email': req.user.email 
    }).sort({ createdAt: -1 });
    
    res.json({ orders });
  } catch (err) {
    console.error('Error fetching user orders:', err);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// Cancel an order (user)
router.post('/orders/:orderId/cancel', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    // Find the order by _id and make sure it belongs to the user
    const order = await Order.findOne({ _id: orderId, 'customerDetails.email': req.user.email });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    // Only allow cancellation if not shipped, delivered, or already cancelled
    if (["Shipped", "Delivered", "Cancelled"].includes(order.orderStatus)) {
      return res.status(400).json({ message: 'Order cannot be cancelled at this stage.' });
    }

    // Cancel in Shiprocket if order was created there
    if (order.shiprocketOrderId) {
      try {
        await cancelShiprocketOrder([order.shiprocketOrderId]);
        console.log('Order cancelled in Shiprocket successfully');
      } catch (shiprocketError) {
        console.error('Failed to cancel order in Shiprocket:', shiprocketError);
        // Continue with local cancellation even if Shiprocket fails
      }
    }

    // Update order status
    order.orderStatus = 'Cancelled';
    order.statusHistory.push({
      status: 'Cancelled',
      timestamp: new Date(),
      comment: 'Order cancelled by customer'
    });
    
    await order.save();

    // Restore stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: item.quantity }
      });
    }

    res.json({ message: 'Order cancelled successfully', order });
  } catch (err) {
    console.error('Error cancelling order:', err);
    res.status(500).json({ message: 'Failed to cancel order' });
  }
});

// Get user cart with populated product details
router.get('/cart', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('cart.productId');
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Transform cart items to match frontend format
    const cartItems = user.cart.map(item => ({
      id: item.productId._id,
      name: item.productId.name,
      price: item.productId.price,
      image: item.productId.image,
      quantity: item.quantity
    }));
    
    res.json({ cart: cartItems });
  } catch (err) {
    console.error('Error fetching user cart:', err);
    res.status(500).json({ message: 'Failed to fetch cart' });
  }
});

// Add/update item in cart
router.post('/cart', auth, async (req, res) => {
  console.log('--- ADD TO CART ---');
  try {
    const { productId, quantity = 1 } = req.body;
    console.log(`Request to add productId: ${productId} with quantity: ${quantity}`);
    
    const user = await User.findById(req.user.id);
    if (!user) {
      console.log('User not found.');
      return res.status(404).json({ message: 'User not found' });
    }
    console.log('User found:', user.email);
    console.log('Cart before:', JSON.stringify(user.cart, null, 2));

    const existingItem = user.cart.find(item => item.productId.toString() === productId);
    
    if (existingItem) {
      console.log('Item exists, updating quantity.');
      existingItem.quantity = quantity;
    } else {
      console.log('Item does not exist, adding to cart.');
      user.cart.push({ productId, quantity });
    }
    
    await user.save();
    console.log('User saved.');
    
    const updatedUser = await User.findById(req.user.id);
    console.log('Cart after update:', JSON.stringify(updatedUser.cart, null, 2));
    
    const populatedUser = await User.findById(req.user.id).populate('cart.productId');
    const cartItems = populatedUser.cart.map(item => ({
      _id: item.productId._id,
      name: item.productId.name,
      price: item.productId.price,
      image: item.productId.image,
      quantity: item.quantity
    }));
    
    res.json({ cart: cartItems });
  } catch (err) {
    console.error('Error updating cart:', err);
    res.status(500).json({ message: 'Failed to update cart' });
  }
});

// Remove item from cart
router.delete('/cart/:productId', auth, async (req, res) => {
  try {
    const { productId } = req.params;
    
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Remove item from cart
    user.cart = user.cart.filter(item => 
      item.productId.toString() !== productId
    );
    
    await user.save();
    
    // Return updated cart
    const updatedUser = await User.findById(req.user.id).populate('cart.productId');
    const cartItems = updatedUser.cart.map(item => ({
      id: item.productId._id,
      name: item.productId.name,
      price: item.productId.price,
      image: item.productId.image,
      quantity: item.quantity
    }));
    
    res.json({ cart: cartItems });
  } catch (err) {
    console.error('Error removing from cart:', err);
    res.status(500).json({ message: 'Failed to remove from cart' });
  }
});

// Clear entire cart
router.delete('/cart', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $set: { cart: [] } });
    res.status(200).json({ message: 'Cart cleared successfully' });
  } catch (err) {
    console.error('Error clearing cart:', err);
    res.status(500).json({ message: 'Failed to clear cart' });
  }
});

// Get user wishlist
router.get('/wishlist', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('wishlist');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ wishlist: user.wishlist || [] });
  } catch (err) {
    console.error('Error fetching user wishlist:', err);
    res.status(500).json({ message: 'Failed to fetch wishlist' });
  }
});

// Add item to wishlist
router.post('/wishlist', auth, async (req, res) => {
  try {
    const { productId } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { wishlist: productId } }, // Atomically add to a set (prevents duplicates)
      { new: true } // Return the updated document
    ).populate('wishlist');
    
    res.status(200).json({ wishlist: updatedUser.wishlist });
  } catch (err) {
    console.error('Error adding to wishlist:', err);
    res.status(500).json({ message: 'Failed to add to wishlist' });
  }
});

// Remove item from wishlist
router.delete('/wishlist/:productId', auth, async (req, res) => {
  try {
    const { productId } = req.params;
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { wishlist: productId } }, // Atomically remove from the array
      { new: true } // Return the updated document
    ).populate('wishlist');

    res.status(200).json({ wishlist: updatedUser.wishlist });
  } catch (err) {
    console.error('Error removing from wishlist:', err);
    res.status(500).json({ message: 'Failed to remove from wishlist' });
  }
});

// Track order status
router.post('/track', async (req, res) => {
  try {
    const { orderId, email } = req.body;

    if (!orderId || !email) {
      return res.status(400).json({ message: 'Order ID and email are required' });
    }

    const order = await Order.findOne({ 
      $or: [
        { orderId: orderId },
        { orderNumber: orderId },
        { _id: mongoose.Types.ObjectId.isValid(orderId) ? orderId : null },
        { razorpayOrderId: orderId } // Also search by razorpay order ID for backward compatibility
      ]
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Security check to ensure the email matches the order
    if (order.customerDetails.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(404).json({ message: 'Order not found' }); // Generic message for security
    }

    // Sync with Shiprocket if shipment ID exists
    if (order.shiprocketShipmentId) {
      try {
        const syncData = await syncOrderStatusFromShiprocket(order.shiprocketShipmentId);
        if (syncData && syncData.status !== order.orderStatus) {
          // Update order status from Shiprocket
          order.orderStatus = syncData.status;
          order.statusHistory.push({
            status: syncData.status,
            timestamp: syncData.lastUpdated,
            comment: `Status synced from Shiprocket: ${syncData.shiprocketStatus}`
          });
          await order.save();
        }
      } catch (syncError) {
        console.error('Failed to sync with Shiprocket:', syncError);
        // Continue with existing data if sync fails
      }
    }

    // Get detailed tracking from Shiprocket if available
    let trackingDetails = null;
    if (order.trackingNumber) {
      try {
        trackingDetails = await trackShiprocketOrder(order.trackingNumber);
      } catch (trackingError) {
        console.error('Failed to get tracking details:', trackingError);
      }
    }

    const response = {
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      status: order.orderStatus,
      tracking_number: order.trackingNumber,
      carrier: order.carrier,
      tracking_url: order.trackingUrl,
      shiprocket_url: order.shiprocketShipmentId ? `https://app.shiprocket.in/orders/${order.shiprocketShipmentId}` : null,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
      history: order.statusHistory.map(h => ({
        status: h.status,
        date: h.timestamp,
        location: h.location,
        description: h.comment
      })),
      shiprocket_tracking: trackingDetails
    };

    res.json(response);
  } catch (err) {
    console.error('Error tracking order:', err);
    res.status(500).json({ message: 'Failed to track order' });
  }
});

// Sync local cart/wishlist with user account (for when guest logs in)
router.post('/sync', auth, async (req, res) => {
  try {
    const { cart = [], wishlist = [] } = req.body;
    
    console.log('Sync request received:', { cart, wishlist });
    
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Merge local cart with user cart
    for (const localItem of cart) {
      try {
        // Validate that the product exists
        const product = await Product.findById(localItem.id);
        if (!product) {
          console.log(`Product ${localItem.id} not found, skipping`);
          continue;
        }
        
        const existingItem = user.cart.find(item => 
          item.productId.toString() === localItem.id
        );
        
        if (existingItem) {
          // Update quantity if local quantity is higher
          if (localItem.quantity > existingItem.quantity) {
            existingItem.quantity = localItem.quantity;
          }
        } else {
          // Add new item
          user.cart.push({ productId: localItem.id, quantity: localItem.quantity });
        }
      } catch (itemError) {
        console.error('Error processing cart item:', localItem, itemError);
        // Continue with other items
      }
    }
    
    // Merge local wishlist with user wishlist
    for (const localItem of wishlist) {
      try {
        // Validate that the product exists
        const product = await Product.findById(localItem.id);
        if (!product) {
          console.log(`Product ${localItem.id} not found, skipping`);
          continue;
        }
        
        const existingItem = user.wishlist.find(item => 
          item.productId.toString() === localItem.id
        );
        
        if (!existingItem) {
          // Add new item
          user.wishlist.push({ productId: localItem.id });
        }
      } catch (itemError) {
        console.error('Error processing wishlist item:', localItem, itemError);
        // Continue with other items
      }
    }
    
    await user.save();
    
    // Return updated cart and wishlist
    const updatedUser = await User.findById(req.user.id)
      .populate('cart.productId')
      .populate('wishlist.productId');
    
    const cartItems = updatedUser.cart.map(item => ({
      id: item.productId._id,
      name: item.productId.name,
      price: item.productId.price,
      image: item.productId.image,
      quantity: item.quantity
    }));
    
    const wishlistItems = updatedUser.wishlist.map(item => ({
      id: item.productId._id,
      name: item.productId.name,
      price: item.productId.price,
      image: item.productId.image
    }));
    
    console.log('Sync completed successfully');
    res.json({ cart: cartItems, wishlist: wishlistItems });
  } catch (err) {
    console.error('Error syncing cart/wishlist:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ message: 'Failed to sync cart/wishlist', error: err.message });
  }
});

export default router;

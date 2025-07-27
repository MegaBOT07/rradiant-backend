import express from 'express';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import { syncOrderStatusFromShiprocket, cancelShiprocketOrder } from '../services/shiprocket.js';

const router = express.Router();

// GET admin dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalUsers = await User.countDocuments();

    const revenueData = await Order.aggregate([
      { $match: { paymentStatus: 'Paid' } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;

    res.json({
      totalProducts,
      totalOrders,
      totalUsers,
      totalRevenue
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    res.status(500).json({ message: 'Failed to fetch admin stats' });
  }
});

// GET all orders for admin
router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error('Error fetching all orders:', err);
    res.status(500).json({ message: 'Failed to fetch all orders' });
  }
});

// PUT update order status
router.put('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    // Validate status
    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // If cancelling order, also cancel in Shiprocket
    if (status === 'Cancelled' && order.shiprocketOrderId) {
      try {
        await cancelShiprocketOrder([order.shiprocketOrderId]);
        console.log('Order cancelled in Shiprocket successfully');
        
        // Restore stock
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { stock: item.quantity }
          });
        }
      } catch (shiprocketError) {
        console.error('Failed to cancel order in Shiprocket:', shiprocketError);
        // Continue with local update
      }
    }

    // Update order status
    order.orderStatus = status;
    order.statusHistory.push({
      status: status,
      timestamp: new Date(),
      comment: 'Status updated by admin'
    });

    const updatedOrder = await order.save();

    res.json(updatedOrder);
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ message: 'Failed to update order status' });
  }
});

// Sync order status with Shiprocket
router.post('/orders/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!order.shiprocketShipmentId) {
      return res.status(400).json({ message: 'No Shiprocket shipment ID found for this order' });
    }

    const syncData = await syncOrderStatusFromShiprocket(order.shiprocketShipmentId);
    
    if (syncData && syncData.status !== order.orderStatus) {
      order.orderStatus = syncData.status;
      order.statusHistory.push({
        status: syncData.status,
        timestamp: syncData.lastUpdated,
        comment: `Status synced from Shiprocket: ${syncData.shiprocketStatus}`
      });
      await order.save();
    }

    res.json({ 
      message: 'Order status synced successfully',
      order,
      syncData
    });
  } catch (err) {
    console.error('Error syncing order status:', err);
    res.status(500).json({ message: 'Failed to sync order status' });
  }
});

// GET all users for admin
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('name email createdAt');
    // For each user, count their orders
    const usersWithOrderCount = await Promise.all(users.map(async user => {
      const orderCount = await Order.countDocuments({ 'customerDetails.email': user.email });
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        orderCount
      };
    }));
    res.json(usersWithOrderCount);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

export default router; 
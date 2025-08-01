import axios from "axios";

let shiprocketToken = null;

export async function loginToShiprocket() {
  try {
    console.log('Attempting Shiprocket login with:', {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD ? '***' : undefined
    });
    // Using specific API endpoint for API user authentication
    const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (res.data && res.data.token) {
      shiprocketToken = res.data.token;
      console.log('Shiprocket login successful. Token received.');
    } else {
      console.error('Shiprocket login failed. No token received:', res.data);
    }
    return shiprocketToken;
  } catch (err) {
    if (err.response) {
      console.error('Shiprocket login error:', err.response.data);
    } else {
      console.error('Shiprocket login error:', err.message);
    }
    throw err;
  }
}

export function getShiprocketToken() {
  return shiprocketToken;
}

export async function createShiprocketOrder(orderData) {
  if (!shiprocketToken) await loginToShiprocket();
  
  try {
    // First verify the token by getting account details
    console.log('Verifying Shiprocket account access...');
    try {
      // Try to get channel details first (this should work for all accounts)
      const channelRes = await axios.get("https://apiv2.shiprocket.in/v1/external/channels", {
        headers: { Authorization: `Bearer ${shiprocketToken}` }
      });
      console.log('Channel verification successful:', channelRes.data);
      
      // Then try to get pickup locations
      const accountRes = await axios.get("https://apiv2.shiprocket.in/v1/external/settings/company/pickup", {
        headers: { Authorization: `Bearer ${shiprocketToken}` }
      });
      console.log('Account verification successful. Your pickup locations:', 
        JSON.stringify(accountRes.data.data.shipping_address.map(addr => ({
          pickup_location: addr.pickup_location,
          address: addr.address,
          city: addr.city,
          state: addr.state,
          pin_code: addr.pin_code
        })), null, 2));
    } catch (verifyErr) {
      console.error('Account verification failed:', verifyErr.response?.data || verifyErr.message);
      throw verifyErr;
    }

    console.log('Attempting to create Shiprocket order with data:', {
      order_id: orderData.order_id,
      pickup_location: orderData.pickup_location,
      billing_customer_name: orderData.billing_customer_name,
      billing_email: orderData.billing_email,
      payment_method: orderData.payment_method,
      sub_total: orderData.sub_total
    });
    
    const res = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
      orderData,
      { headers: { Authorization: `Bearer ${shiprocketToken}` } }
    );
    if (res.data.message && res.data.message.includes('Wrong Pickup location')) {
      console.log('Available pickup locations:', JSON.stringify(res.data.data.data, null, 2));
      throw new Error(`Wrong pickup location. Available locations are shown above.`);
    }
    console.log('Shiprocket order created successfully:', res.data);
    return res.data;
  } catch (err) {
    // If token expired, re-login and retry once
    if (err.response && err.response.status === 401) {
      console.log('Token expired, attempting to re-login...');
      await loginToShiprocket();
      const res = await axios.post(
        "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
        orderData,
        { headers: { Authorization: `Bearer ${shiprocketToken}` } }
      );
      return res.data;
    }
    if (err.response) {
      console.error('Shiprocket API Error:', {
        status: err.response.status,
        data: err.response.data,
        headers: err.response.headers
      });
    }
    throw err;
  }
}

// Track order in Shiprocket
export async function trackShiprocketOrder(awbCode) {
  if (!shiprocketToken) await loginToShiprocket();
  
  try {
    const res = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awbCode}`,
      { headers: { Authorization: `Bearer ${shiprocketToken}` } }
    );
    console.log('Shiprocket tracking response:', res.data);
    return res.data;
  } catch (err) {
    // If token expired, re-login and retry once
    if (err.response && err.response.status === 401) {
      console.log('Token expired, attempting to re-login...');
      await loginToShiprocket();
      const res = await axios.get(
        `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awbCode}`,
        { headers: { Authorization: `Bearer ${shiprocketToken}` } }
      );
      return res.data;
    }
    
    if (err.response) {
      console.error('Shiprocket tracking error:', err.response.data);
    }
    throw err;
  }
}

// Cancel order in Shiprocket
export async function cancelShiprocketOrder(orderIds) {
  if (!shiprocketToken) await loginToShiprocket();
  
  try {
    const res = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/orders/cancel",
      { ids: orderIds },
      { headers: { Authorization: `Bearer ${shiprocketToken}` } }
    );
    console.log('Shiprocket cancellation response:', res.data);
    return res.data;
  } catch (err) {
    // If token expired, re-login and retry once
    if (err.response && err.response.status === 401) {
      console.log('Token expired, attempting to re-login...');
      await loginToShiprocket();
      const res = await axios.post(
        "https://apiv2.shiprocket.in/v1/external/orders/cancel",
        { ids: orderIds },
        { headers: { Authorization: `Bearer ${shiprocketToken}` } }
      );
      return res.data;
    }
    
    if (err.response) {
      console.error('Shiprocket cancellation error:', err.response.data);
    }
    throw err;
  }
}

// Get order status from Shiprocket
export async function getShiprocketOrderStatus(orderIds) {
  if (!shiprocketToken) await loginToShiprocket();
  
  try {
    const res = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/orders/show/${orderIds}`,
      { headers: { Authorization: `Bearer ${shiprocketToken}` } }
    );
    console.log('Shiprocket order status response:', res.data);
    return res.data;
  } catch (err) {
    // If token expired, re-login and retry once
    if (err.response && err.response.status === 401) {
      console.log('Token expired, attempting to re-login...');
      await loginToShiprocket();
      const res = await axios.get(
        `https://apiv2.shiprocket.in/v1/external/orders/show/${orderIds}`,
        { headers: { Authorization: `Bearer ${shiprocketToken}` } }
      );
      return res.data;
    }
    
    if (err.response) {
      console.error('Shiprocket order status error:', err.response.data);
    }
    throw err;
  }
}

// Synchronize order status from Shiprocket
export async function syncOrderStatusFromShiprocket(shipmentId) {
  if (!shiprocketToken) await loginToShiprocket();
  
  try {
    const res = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${shipmentId}`,
      { headers: { Authorization: `Bearer ${shiprocketToken}` } }
    );
    
    if (res.data && res.data.tracking_data) {
      const trackingData = res.data.tracking_data;
      const currentStatus = trackingData.track_status;
      
      // Map Shiprocket status to our status
      const statusMapping = {
        'NEW': 'Pending',
        'PKP': 'Processing', // Pickup
        'OFD': 'Shipped', // Out for delivery
        'DEL': 'Delivered', // Delivered
        'RTO': 'Cancelled', // Return to origin
        'CNF': 'Cancelled', // Cancelled
        'UND': 'Cancelled', // Undelivered
      };
      
      return {
        status: statusMapping[currentStatus] || 'Processing',
        shiprocketStatus: currentStatus,
        trackingHistory: trackingData.shipment_track || [],
        lastUpdated: new Date()
      };
    }
    
    return null;
  } catch (err) {
    if (err.response && err.response.status === 401) {
      console.log('Token expired, attempting to re-login...');
      await loginToShiprocket();
      return await syncOrderStatusFromShiprocket(shipmentId);
    }
    
    if (err.response) {
      console.error('Shiprocket sync error:', err.response.data);
    }
    throw err;
  }
}
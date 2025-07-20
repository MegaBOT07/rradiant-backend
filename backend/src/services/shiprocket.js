import axios from "axios";

let shiprocketToken = null;

export async function loginToShiprocket() {
  try {
    console.log('Attempting Shiprocket login with:', {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD ? '***' : undefined
    });
    const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
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
    const res = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
      orderData,
      { headers: { Authorization: `Bearer ${shiprocketToken}` } }
    );
    return res.data;
  } catch (err) {
    // If token expired, re-login and retry once
    if (err.response && err.response.status === 401) {
      await loginToShiprocket();
      const res = await axios.post(
        "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
        orderData,
        { headers: { Authorization: `Bearer ${shiprocketToken}` } }
      );
      return res.data;
    }
    throw err;
  }
}
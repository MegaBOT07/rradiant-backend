import axios from "axios";

let shiprocketToken = null;

export async function loginToShiprocket() {
  const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD,
  });

  shiprocketToken = res.data.token;
  return shiprocketToken;
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
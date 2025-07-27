// Universal Order ID Generator
// This ensures the same order ID is used across database, Shiprocket, and all frontend pages

let orderCounter = 1000; // Starting counter for order numbers

export function generateUniversalOrderId() {
  const timestamp = Date.now();
  const counter = (orderCounter++).toString().padStart(4, '0');
  const randomSuffix = Math.random().toString(36).substr(2, 4).toUpperCase();
  
  // Format: RR-YYYYMMDD-COUNTER-SUFFIX
  const date = new Date(timestamp);
  const dateStr = date.getFullYear().toString() + 
                  (date.getMonth() + 1).toString().padStart(2, '0') + 
                  date.getDate().toString().padStart(2, '0');
  
  const universalOrderId = `RR-${dateStr}-${counter}-${randomSuffix}`;
  
  return {
    orderId: universalOrderId,
    orderNumber: universalOrderId, // Same as orderId for universal use
    timestamp: timestamp
  };
}

// Reset counter daily (optional, for better order management)
export function resetOrderCounter() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();
  
  setTimeout(() => {
    orderCounter = 1000;
    resetOrderCounter(); // Set up next reset
  }, msUntilMidnight);
}

// Initialize counter reset
resetOrderCounter();

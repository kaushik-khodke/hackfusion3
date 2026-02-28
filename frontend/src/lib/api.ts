/**
 * Central API configuration.
 * Set VITE_API_URL in your .env file to point to the backend.
 * Local dev default: http://localhost:8000
 * Production: https://your-backend.onrender.com
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

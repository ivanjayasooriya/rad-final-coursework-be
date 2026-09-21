// Runs before every test file (and before any module is imported),
// so modules that read process.env at import time see these values.
process.env.JWT_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.EMAIL_USER = "test@example.com";
process.env.EMAIL_PASS = "test-pass";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.GOOGLE_API_KEY = "test-google-key";

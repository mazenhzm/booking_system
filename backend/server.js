import app from './app.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, () => {
  console.log(`Booking system server running on http://localhost:${PORT}`);
});

// server.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const twilio = require('twilio');

require('dotenv').config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
// Configure CORS to allow requests from your frontend
app.use(cors({
  origin: '*', // During development, you can use * 
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());
app.options('*', cors());

// Add a basic route to test if the server is running
app.get('/', (req, res) => {
  res.send('Woman Safety DTI Backend is running');
});

// MongoDB connection setup
const mongoURI = process.env.MONGO_URI;

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.error('MongoDB connection error:', error));

// Define Location schema and model
const locationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  description: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now } // Added timestamp
});

const Location = mongoose.model('Location', locationSchema);

// --- Server-Sent Events (SSE) setup ---
let clients = [];

// SSE endpoint
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Send headers to establish SSE connection

  // Add this client to the clients array
  const client = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  clients.push(client);

  // Remove the client on connection close
  req.on('close', () => {
    clients = clients.filter(c => c !== client);
  });
});

// Broadcast function to notify all connected clients
function broadcast(data) {
  clients.forEach(client => client(data));
}

// Routes
// GET /api/locations - Retrieve all pinned locations
app.get('/api/locations', async (req, res) => {
  try {
    const locations = await Location.find().sort({ timestamp: -1 }); // Sort by newest first
    res.json(locations);
  } catch (error) {
    console.error('Error retrieving locations:', error);
    res.status(500).json({ error: 'Failed to retrieve locations' });
  }
});

// POST /api/locations - Add a new pinned location
app.post('/api/locations', async (req, res) => {
  const { latitude, longitude, description } = req.body;
  
  // Validate request data
  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }

  try {
    const newLocation = new Location({ 
      latitude, 
      longitude, 
      description: description || '' 
    });
    await newLocation.save();
    // Notify all connected SSE clients
    broadcast({ type: 'NEW_MARKER', data: newLocation });
    res.status(201).json(newLocation);
  } catch (error) {
    console.error('Error saving location:', error);
    res.status(500).json({ error: 'Failed to save location' });
  }
});

// DELETE /api/locations - Remove a pinned location by latitude and longitude
app.delete('/api/locations', async (req, res) => {
  const { latitude, longitude } = req.body;

  console.log("Received DELETE request with:", { latitude, longitude });

  if (!latitude || !longitude) {
    console.error("Validation failed: Missing latitude or longitude");
    return res.status(400).json({ error: 'Latitude and longitude are required for deletion' });
  }

  try {
    const result = await Location.findOneAndDelete({
      latitude: { $gte: latitude - 0.00001, $lte: latitude + 0.00001 },
      longitude: { $gte: longitude - 0.00001, $lte: longitude + 0.00001 },
    });
    if (result) {
      console.log("Marker deleted from database:", result);
      broadcast({ type: 'DELETE_MARKER', data: { latitude, longitude } });
      res.json({ success: true, message: 'Marker deleted successfully' });
    } else {
      console.error("Marker not found in database for deletion");
      res.status(404).json({ error: 'Marker not found' });
    }
  } catch (error) {
    console.error("Error deleting marker from database:", error);
    res.status(500).json({ error: 'Failed to delete marker' });
  }
});

app.post('/send-sos', async (req, res) => {
  const { latitude, longitude } = req.body;

  console.log("Received SOS request with:", { latitude, longitude });
  console.log("Twilio Credentials:", {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN ? "Loaded" : "Missing",
    twilioNumber: process.env.TWILIO_NUMBER,
  });

  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Location data is required' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioNumber = process.env.TWILIO_NUMBER;
  const emergencyContacts = [
    '+918360708882',
    '+917902844175',
    '+917470651181'
  ];

  const message = `EMERGENCY: I need help! My location: https://www.google.com/maps?q=${latitude},${longitude}`;

  const results = [];

  for (const contact of emergencyContacts) {
    try {
      const client = twilio(accountSid, authToken);
      const twilioResponse = await client.messages.create({
        body: message,
        to: contact,
        from: twilioNumber
      });

      if (twilioResponse.sid) {
        results.push({ contact, success: true });
      } else {
        results.push({ contact, success: false, error: 'Failed to send' });
      }
    } catch (error) {
      results.push({ contact, success: false, error: error.message });
      console.error(`Error sending to ${contact}:`, error);
    }
  }

  const successful = results.filter(r => r.success).length;

  if (successful === emergencyContacts.length) {
    res.json({ success: true, message: 'All messages sent successfully' });
  } else if (successful > 0) {
    res.json({
      success: true,
      partial: true,
      successful,
      total: emergencyContacts.length
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to send any messages'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
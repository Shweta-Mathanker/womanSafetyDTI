// server.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

require('dotenv').config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
// Configure CORS to allow requests from your frontend
app.use(cors({
  origin: '*', // During development, you can use * 
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());

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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
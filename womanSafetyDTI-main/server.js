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
app.use(cors()); // Allow cross-origin requests
app.use(bodyParser.json()); // Parse JSON request bodies

// MongoDB connection setup
const mongoURI = process.env.MONGO_URI // or replace with MongoDB Atlas URI

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
});

const Location = mongoose.model('Location', locationSchema);

// Routes

// GET /api/locations - Retrieve all pinned locations
app.get('/api/locations', async (req, res) => {
  try {
    const locations = await Location.find();
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
    const newLocation = new Location({ latitude, longitude, description });
    await newLocation.save();
    res.status(201).json(newLocation);
  } catch (error) {
    console.error('Error saving location:', error);
    res.status(500).json({ error: 'Failed to save location' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
0
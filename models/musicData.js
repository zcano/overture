const mongoose = require('mongoose');

const musicDataSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    default: 0,
    max: 5
  },
  reviews: {
    type: Array
  }
});

const musicData = mongoose.model('musicData', musicDataSchema);

module.exports = musicData;

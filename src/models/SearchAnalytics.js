const mongoose = require('mongoose');

const searchAnalyticsSchema = new mongoose.Schema({
  searchTerm: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  resultCount: {
    type: Number,
    required: true,
    min: 0
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  userType: {
    type: String,
    enum: ['worker', 'owner'],
    default: 'worker'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  type: {
    type: String,
    enum: ['search', 'popular'],
    default: 'search'
  },
  count: {
    type: Number,
    default: 1
  },
  lastSearched: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for analytics queries
searchAnalyticsSchema.index({ searchTerm: 1, type: 1 });
searchAnalyticsSchema.index({ timestamp: -1 });
searchAnalyticsSchema.index({ userId: 1, timestamp: -1 });

// TTL index to automatically delete old analytics data (keep for 90 days)
searchAnalyticsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model('SearchAnalytics', searchAnalyticsSchema);
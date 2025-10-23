// backend/src/models/Vendor.js
const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Vendor name is required'],
    trim: true
  },
  company: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required']
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  // Business Information
  gstNumber: {
    type: String,
    uppercase: true,
    trim: true
  },
  panNumber: {
    type: String,
    uppercase: true,
    trim: true
  },
  licenseNumber: {
    type: String,
    trim: true
  },
  // Vendor Categories
  categories: [{
    type: String,
   enum: [
    'General',
    'Cardio',
    'Diabetes',
    'Antibiotic',
    'Analgesic',
    'Antiseptic',
    'Vaccine',
    'Anti-inflammatory',
    'Antihistamine', 'Vitamins', 'Ayurvedic'   // ✅ Add this
  ]
  }],
  // Payment Terms
  paymentTerms: {
    creditDays: { type: Number, default: 30 },
    minimumOrderValue: { type: Number, default: 1000 },
    discountPercentage: { type: Number, default: 0 }
  },
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  // Performance Metrics
  performance: {
    totalOrders: { type: Number, default: 0 },
    onTimeDeliveryRate: { type: Number, default: 100 },
    qualityRating: { type: Number, default: 5, min: 1, max: 5 },
    lastOrderDate: Date
  },
  // Contact Person
  contactPerson: {
    name: String,
    designation: String,
    phone: String,
    email: String
  }
}, {
  timestamps: true
});

// Indexes
vendorSchema.index({ name: 1 });
vendorSchema.index({ isActive: 1 });
vendorSchema.index({ categories: 1 });

module.exports = mongoose.model('Vendor', vendorSchema);
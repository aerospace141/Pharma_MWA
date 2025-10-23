const mongoose = require('mongoose');

const tabletSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Medicine name is required'],
    trim: true,
    index: true
  },
  brand: {
    type: String,
    required: [true, 'Brand name is required'],
    trim: true,
    index: true
  },
  company: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    index: true
  },
  strength: {
    type: String,
    required: [true, 'Strength is required'],
    trim: true
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative'],
    index: true
  },
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0,
    index: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  // For optimized searching
  searchTerms: [{
    type: String,
    lowercase: true
  }],
  popularity: {
    type: Number,
    default: 0,
    index: true
  },
  // Medicine specific fields
  dosageForm: {
    type: String,
    enum: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Drops', 'Other'],
    default: 'Tablet'
  },
  expiryDate: {
    type: Date
  },
  batchNumber: {
    type: String,
    trim: true
  },
  // Inventory management
  minStockLevel: {
    type: Number,
    default: 10
  },
  maxStockLevel: {
    type: Number,
    default: 100
  },
  supplier: {
    name: String,
    contact: String,
    email: String
  },
  // Pricing history for analytics
  priceHistory: [{
    price: Number,
    date: { type: Date, default: Date.now },
    reason: String
  }],
  // Status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  // SEO and search optimization
  tags: [String],
  barcode: {
    type: String,
    unique: true,
    sparse: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for optimized searching
tabletSchema.index({ name: 'text', brand: 'text', company: 'text', category: 'text' });
tabletSchema.index({ name: 1, brand: 1 });
tabletSchema.index({ category: 1, price: 1 });
tabletSchema.index({ popularity: -1, stock: -1 });
tabletSchema.index({ stock: 1, isActive: 1 });

// Virtual for stock status
tabletSchema.virtual('stockStatus').get(function() {
  if (this.stock === 0) return 'Out of Stock';
  if (this.stock <= this.minStockLevel) return 'Low Stock';
  return 'In Stock';
});

// Virtual for price per unit (if packaged)
tabletSchema.virtual('displayName').get(function() {
  return `${this.name} ${this.strength} - ${this.brand}`;
});

// Pre-save middleware to update search terms
tabletSchema.pre('save', function(next) {
  if (this.isModified('name') || this.isModified('brand') || this.isModified('company')) {
    this.searchTerms = [
      this.name.toLowerCase(),
      this.brand.toLowerCase(),
      this.company.toLowerCase(),
      this.category.toLowerCase(),
      ...this.name.toLowerCase().split(' '),
      ...this.brand.toLowerCase().split(' ')
    ].filter(term => term.length > 2); // Only terms longer than 2 characters
  }
  next();
});

module.exports = mongoose.model('Tablet', tabletSchema);
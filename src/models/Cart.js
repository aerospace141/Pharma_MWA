// backend/src/models/Cart.js
const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  tablet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tablet',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
    max: [100, 'Quantity cannot exceed 100']
  },
  priceAtTime: {
    type: Number,
    required: true,
    min: [0, 'Price cannot be negative']
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // For saved items functionality
  savedForLater: {
    type: Boolean,
    default: false
  },
  savedAt: {
    type: Date
  }
}, {
  _id: true // Ensure each item has its own ID for easy updates
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    unique: true // Each user can only have one cart
  },
  items: [cartItemSchema],
  savedItems: [cartItemSchema], // Items saved for later
  totalItems: {
    type: Number,
    default: 0,
    min: [0, 'Total items cannot be negative']
  },
  totalAmount: {
    type: Number,
    default: 0,
    min: [0, 'Total amount cannot be negative']
  },
  // Cart metadata
  lastSyncedAt: {
    type: Date,
    default: Date.now
  },
  // Session tracking
  sessionId: {
    type: String,
    index: true
  },
  // Cart expiration (for cleanup of abandoned carts)
  expiresAt: {
    type: Date,
    default: Date.now,
    expires: 2592000 // 30 days
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
cartSchema.index({ user: 1 });
cartSchema.index({ updatedAt: -1 });
cartSchema.index({ 'items.tablet': 1 });
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for cart status
cartSchema.virtual('isEmpty').get(function() {
  return this.items.length === 0;
});

// Virtual for unique items count
cartSchema.virtual('uniqueItems').get(function() {
  return this.items.length;
});

// Virtual for average item price
cartSchema.virtual('averageItemPrice').get(function() {
  if (this.totalItems === 0) return 0;
  return this.totalAmount / this.totalItems;
});

// Virtual for cart weight (if needed for shipping calculations)
cartSchema.virtual('estimatedWeight').get(function() {
  // Assume average tablet weight of 0.5 grams
  return this.totalItems * 0.5;
});

// Pre-save middleware to update totals
cartSchema.pre('save', async function(next) {
  if (this.isModified('items')) {
    await this.calculateTotals();
  }
  
  // Update expiration date on any modification
  this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  
  next();
});

// Method to calculate totals
cartSchema.methods.calculateTotals = async function() {
  let totalItems = 0;
  let totalAmount = 0;

  for (const item of this.items) {
    totalItems += item.quantity;
    totalAmount += item.priceAtTime * item.quantity;
  }

  this.totalItems = totalItems;
  this.totalAmount = totalAmount;
  this.lastSyncedAt = new Date();
};

// Method to validate cart items against current stock
cartSchema.methods.validateItems = async function() {
  const Tablet = mongoose.model('Tablet');
  const invalidItems = [];

  for (const item of this.items) {
    const tablet = await Tablet.findById(item.tablet);
    
    if (!tablet) {
      invalidItems.push({
        itemId: item._id,
        issue: 'Medicine not found',
        action: 'remove'
      });
    } else if (!tablet.isActive) {
      invalidItems.push({
        itemId: item._id,
        issue: 'Medicine no longer available',
        action: 'remove'
      });
    } else if (tablet.stock < item.quantity) {
      invalidItems.push({
        itemId: item._id,
        issue: `Insufficient stock (available: ${tablet.stock})`,
        action: 'reduce',
        maxQuantity: tablet.stock
      });
    } else if (tablet.price !== item.priceAtTime) {
      invalidItems.push({
        itemId: item._id,
        issue: `Price changed from ₹${item.priceAtTime} to ₹${tablet.price}`,
        action: 'update_price',
        newPrice: tablet.price
      });
    }
  }

  return invalidItems;
};

// Method to clean up invalid items
cartSchema.methods.cleanupInvalidItems = async function() {
  const invalidItems = await this.validateItems();
  let hasChanges = false;

  for (const invalid of invalidItems) {
    const item = this.items.id(invalid.itemId);
    
    if (!item) continue;

    switch (invalid.action) {
      case 'remove':
        this.items.pull(invalid.itemId);
        hasChanges = true;
        break;
      
      case 'reduce':
        item.quantity = invalid.maxQuantity;
        item.updatedAt = new Date();
        hasChanges = true;
        break;
      
      case 'update_price':
        item.priceAtTime = invalid.newPrice;
        item.updatedAt = new Date();
        hasChanges = true;
        break;
    }
  }

  if (hasChanges) {
    await this.calculateTotals();
  }

  return { hasChanges, invalidItems };
};

// Method to add item to cart
cartSchema.methods.addItem = async function(tabletId, quantity = 1) {
  const Tablet = mongoose.model('Tablet');
  const tablet = await Tablet.findById(tabletId);

  if (!tablet) {
    throw new Error('Medicine not found');
  }

  if (!tablet.isActive) {
    throw new Error('Medicine is not available');
  }

  if (tablet.stock < quantity) {
    throw new Error(`Insufficient stock. Only ${tablet.stock} items available`);
  }

  // Check if item already exists
  const existingItem = this.items.find(item => 
    item.tablet.toString() === tabletId.toString()
  );

  if (existingItem) {
    const newQuantity = existingItem.quantity + quantity;
    
    if (newQuantity > tablet.stock) {
      throw new Error(`Cannot add ${quantity} more items. Maximum available: ${tablet.stock - existingItem.quantity}`);
    }

    existingItem.quantity = newQuantity;
    existingItem.updatedAt = new Date();
  } else {
    this.items.push({
      tablet: tabletId,
      quantity,
      priceAtTime: tablet.price,
      addedAt: new Date()
    });
  }

  await this.calculateTotals();
  return this;
};

// Method to update item quantity
cartSchema.methods.updateItemQuantity = async function(itemId, quantity) {
  const item = this.items.id(itemId);
  
  if (!item) {
    throw new Error('Item not found in cart');
  }

  const Tablet = mongoose.model('Tablet');
  const tablet = await Tablet.findById(item.tablet);

  if (!tablet || !tablet.isActive) {
    throw new Error('Medicine is no longer available');
  }

  if (tablet.stock < quantity) {
    throw new Error(`Insufficient stock. Only ${tablet.stock} items available`);
  }

  item.quantity = quantity;
  item.updatedAt = new Date();

  await this.calculateTotals();
  return this;
};

// Method to remove item from cart
cartSchema.methods.removeItem = function(itemId) {
  this.items.pull(itemId);
  return this.calculateTotals();
};

// Method to clear cart
cartSchema.methods.clear = function() {
  this.items = [];
  this.savedItems = [];
  this.totalItems = 0;
  this.totalAmount = 0;
  this.lastSyncedAt = new Date();
  return this;
};

// Static method to cleanup abandoned carts
cartSchema.statics.cleanupAbandonedCarts = async function() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const result = await this.deleteMany({
    updatedAt: { $lt: thirtyDaysAgo },
    totalItems: 0
  });

  return result.deletedCount;
};

// Static method to get cart analytics
cartSchema.statics.getCartAnalytics = async function() {
  const analytics = await this.aggregate([
    {
      $match: { totalItems: { $gt: 0 } }
    },
    {
      $group: {
        _id: null,
        totalCarts: { $sum: 1 },
        averageCartSize: { $avg: '$totalItems' },
        averageCartValue: { $avg: '$totalAmount' },
        totalCartValue: { $sum: '$totalAmount' }
      }
    }
  ]);

  // Get most added items
  const popularItems = await this.aggregate([
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.tablet',
        totalQuantity: { $sum: '$items.quantity' },
        timesAdded: { $sum: 1 }
      }
    },
    { $sort: { totalQuantity: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'tablets',
        localField: '_id',
        foreignField: '_id',
        as: 'tablet'
      }
    },
    { $unwind: '$tablet' },
    {
      $project: {
        name: '$tablet.name',
        brand: '$tablet.brand',
        totalQuantity: 1,
        timesAdded: 1
      }
    }
  ]);

  return {
    overview: analytics[0] || {
      totalCarts: 0,
      averageCartSize: 0,
      averageCartValue: 0,
      totalCartValue: 0
    },
    popularItems
  };
};

module.exports = mongoose.model('Cart', cartSchema);
const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
  billNumber: {
    type: String,
    required: true,
    unique: true
  },
  worker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true
  },
  customer: {
    name: String,
    phone: String,
    email: String
  },
  items: [{
    tablet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tablet',
      required: true
    },
    name: String, // Snapshot for historical data
    brand: String,
    strength: String,
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Net Banking'],
    default: 'Cash'
  },
  status: {
    type: String,
    enum: ['Draft', 'Completed', 'Cancelled', 'Refunded'],
    default: 'Completed'
  },
  notes: String,
  // For PDF generation
  pdfPath: String
}, {
  timestamps: true
});

// Auto-generate bill number
billSchema.pre('save', async function(next) {
  if (!this.billNumber) {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.constructor.countDocuments({
      createdAt: {
        $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        $lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
      }
    });
    this.billNumber = `BILL-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;
  }
  next();
});

// Indexes for faster queries
billSchema.index({ worker: 1, createdAt: -1 });
billSchema.index({ billNumber: 1 });
billSchema.index({ createdAt: -1 });
billSchema.index({ status: 1 });

module.exports = mongoose.model('Bill', billSchema);
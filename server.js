// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const tabletRoutes = require('./src/routes/tabletRoutes');
const workerRoutes = require('./src/routes/workerRoutes');
const ownerRoutes = require('./src/routes/ownerRoutes');
const billRoutes = require('./src/routes/billRoutes');
const vendorRoutes = require('./src/routes2/vendorRoutes2'); // NEW
const stockRequestRoutes = require('./src/routes2/stockRequestRoutes2');
const vendorRoutes2 = require('./src/routes/vendorRoutes');

// Import middleware
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://ayush1777:agr11@cluster0.0128p.mongodb.net/pharmacare', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB');
  // Seed initial data
  seedDatabase();
})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tablets', tabletRoutes);
app.use('/api/cart', require('./src/routes/cartRoutes'));

app.use('/api/worker', workerRoutes);
app.use('/api/owner', ownerRoutes);

app.use('/api/bills', billRoutes);
app.use('/api/stock-requests', stockRequestRoutes);
app.use('/api/vendors', vendorRoutes);
// app.use('/api/owner/vendors', vendor);
app.use('/api/vendors', vendorRoutes2);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime() 
  });
});

// Error handling middleware
app.use(errorHandler);

// Handle 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Seed database with sample data
async function seedDatabase() {
  const Tablet = require('./src/models/Tablet');
  const Owner = require('./src/models/Owner');
  const Worker = require('./src/models/Worker');
  const Vendor = require('./src/models/Vendor'); // NEW
  const bcrypt = require('bcryptjs');

  try {
    // Check if data already exists
    const tabletCount = await Tablet.countDocuments();
    if (tabletCount === 0) {
      console.log('🌱 Seeding database with sample medicines...');
      
      const sampleMedicines = [
        {
          name: 'Paracetamol',
          brand: 'Crocin',
          company: 'GSK',
          strength: '500mg',
          price: 50,
          stock: 100,
          category: 'Pain Relief',
          description: 'Effective pain reliever and fever reducer',
          searchTerms: ['paracetamol', 'crocin', 'fever', 'pain', 'headache'],
          popularity: 95
        },
        {
          name: 'Paracetamol',
          brand: 'Dolo 650',
          company: 'Micro Labs',
          strength: '650mg',
          price: 80,
          stock: 75,
          category: 'Pain Relief',
          description: 'High strength paracetamol for severe pain',
          searchTerms: ['paracetamol', 'dolo', 'fever', 'pain'],
          popularity: 90
        },
        {
          name: 'Ibuprofen',
          brand: 'Brufen',
          company: 'Abbott',
          strength: '400mg',
          price: 120,
          stock: 60,
          category: 'Anti-inflammatory',
          description: 'Anti-inflammatory pain reliever',
          searchTerms: ['ibuprofen', 'brufen', 'inflammation', 'pain'],
          popularity: 80
        },
        {
          name: 'Cetirizine',
          brand: 'Zyrtec',
          company: 'UCB',
          strength: '10mg',
          price: 90,
          stock: 50,
          category: 'Antihistamine',
          description: 'Allergy relief medication',
          searchTerms: ['cetirizine', 'zyrtec', 'allergy', 'antihistamine'],
          popularity: 75
        },
        {
          name: 'Amoxicillin',
          brand: 'Amoxil',
          company: 'GSK',
          strength: '500mg',
          price: 150,
          stock: 40,
          category: 'Antibiotic',
          description: 'Broad spectrum antibiotic',
          searchTerms: ['amoxicillin', 'amoxil', 'antibiotic', 'infection'],
          popularity: 70
        },
        {
          name: 'Omeprazole',
          brand: 'Prilosec',
          company: 'AstraZeneca',
          strength: '20mg',
          price: 200,
          stock: 30,
          category: 'Antacid',
          description: 'Proton pump inhibitor for acid reflux',
          searchTerms: ['omeprazole', 'prilosec', 'acid', 'reflux', 'stomach'],
          popularity: 65
        },
        {
          name: 'Metformin',
          brand: 'Glucophage',
          company: 'Merck',
          strength: '500mg',
          price: 180,
          stock: 45,
          category: 'Diabetes',
          description: 'Type 2 diabetes medication',
          searchTerms: ['metformin', 'glucophage', 'diabetes', 'blood sugar'],
          popularity: 85
        },
        {
          name: 'Aspirin',
          brand: 'Ecosprin',
          company: 'USV',
          strength: '75mg',
          price: 25,
          stock: 120,
          category: 'Cardio',
          description: 'Low dose aspirin for heart protection',
          searchTerms: ['aspirin', 'ecosprin', 'heart', 'cardio', 'blood thinner'],
          popularity: 60
        }
      ];

      await Tablet.insertMany(sampleMedicines);
      console.log('✅ Sample medicines added');
    }

    // NEW: Seed vendors
    const vendorCount = await Vendor.countDocuments();
    if (vendorCount === 0) {
      console.log('🏢 Seeding database with sample vendors...');
      
      const sampleVendors = [
        {
          name: 'Rajesh Kumar',
          company: 'MediSupply Corp',
          email: 'rajesh@medisupply.com',
          phone: '+91-9876543210',
          address: {
            street: '123 Medical District',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India'
          },
          gstNumber: 'GST123456789',
          categories: [ 'General'],
          paymentTerms: {
            creditDays: 30,
            minimumOrderValue: 5000,
            discountPercentage: 5
          },
          contactPerson: {
            name: 'Priya Sharma',
            designation: 'Sales Manager',
            phone: '+91-9876543211',
            email: 'priya@medisupply.com'
          }
        },
        {
          name: 'Amit Patel',
          company: 'PharmaDistributors Ltd',
          email: 'amit@pharmadist.com',
          phone: '+91-9876543212',
          address: {
            street: '456 Pharma Avenue',
            city: 'Delhi',
            state: 'Delhi',
            pincode: '110001',
            country: 'India'
          },
          gstNumber: 'GST987654321',
          categories: ['Diabetes', 'Cardio', 'Anti-inflammatory'],
          paymentTerms: {
            creditDays: 45,
            minimumOrderValue: 3000,
            discountPercentage: 7
          },
          contactPerson: {
            name: 'Suresh Gupta',
            designation: 'Business Development',
            phone: '+91-9876543213',
            email: 'suresh@pharmadist.com'
          }
        },
        {
          name: 'Dr. Sunita Reddy',
          company: 'HealthCare Supplies',
          email: 'sunita@healthcare.com',
          phone: '+91-9876543214',
          address: {
            street: '789 Medical Plaza',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '560001',
            country: 'India'
          },
          gstNumber: 'GST456789123',
          categories: ['Antihistamine', 'Vitamins', 'Ayurvedic'],
          paymentTerms: {
            creditDays: 25,
            minimumOrderValue: 2000,
            discountPercentage: 10
          },
          contactPerson: {
            name: 'Ramesh Kumar',
            designation: 'Operations Head',
            phone: '+91-9876543215',
            email: 'ramesh@healthcare.com'
          }
        }
      ];

      await Vendor.insertMany(sampleVendors);
      console.log('✅ Sample vendors added');
    }


    // Create sample owner
    const ownerCount = await Owner.countDocuments();
    if (ownerCount === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await Owner.create({
        name: 'Admin User',
        email: 'admin@pharmacare.com',
        password: hashedPassword,
        pharmacyName: 'PharmaCare Store',
        phone: '9876543210'
      });
      console.log('✅ Sample owner created (admin@pharmacare.com / admin123)');
    }

    // Create sample worker
    const workerCount = await Worker.countDocuments();
    if (workerCount === 0) {
      const hashedPassword = await bcrypt.hash('demo123', 10);
      await Worker.create({
        name: 'Demo Worker',
        email: 'worker@demo.com',
        password: hashedPassword,
        phone: '9876543211',
        employeeId: 'EMP001'
      });
      console.log('✅ Sample worker created (worker@demo.com / demo123)');
    }

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  }
}

module.exports = app;
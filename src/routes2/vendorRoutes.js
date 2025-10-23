// backend/src/routes/vendorRoutes.js
const express = require('express');
const router = express.Router();
const Vendor = require('../models/Vendor');
// Import the middleware file twice under different names
const authMiddleware = require('../middleware/authMiddleware'); // main middleware
const authFile = require('../middleware/authMiddleware.js');    // to get requireOwner if available

// Fallback: use role check manually if requireOwner not accessible
const requireOwner = authFile.requireOwner || ((req, res, next) => {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ message: 'Access denied: Owner only' });
  }
  next();
});

// GET ALL VENDORS (Owner only)
router.get('/', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category, isActive } = req.query;

    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) {
      query.categories = { $in: [category] };
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const vendors = await Vendor.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const totalVendors = await Vendor.countDocuments(query);

    res.json({
      success: true,
      vendors,
      totalPages: Math.ceil(totalVendors / limit),
      currentPage: page,
      totalVendors
    });

  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors'
    });
  }
});

// CREATE VENDOR
router.post('/', authMiddleware, requireOwner, async (req, res) => {
  try {
    const vendor = new Vendor(req.body);
    await vendor.save();

    res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      vendor
    });

  } catch (error) {
    console.error('Create vendor error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create vendor'
    });
  }
});

// UPDATE VENDOR
router.put('/:id', authMiddleware, requireOwner, async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      message: 'Vendor updated successfully',
      vendor
    });

  } catch (error) {
    console.error('Update vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vendor'
    });
  }
});

// DELETE VENDOR
router.delete('/:id', authMiddleware, requireOwner, async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      message: 'Vendor deactivated successfully'
    });

  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate vendor'
    });
  }
});

// GET VENDORS FOR DROPDOWN (Both worker and owner)
router.get('/list/dropdown', authMiddleware, async (req, res) => {
  try {
    const vendors = await Vendor.find({ isActive: true })
      .select('name company categories')
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      vendors
    });

  } catch (error) {
    console.error('Get vendor dropdown error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors'
    });
  }
});

module.exports = router;
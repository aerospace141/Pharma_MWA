// backend/src/routes/vendorRoutes.js
const express = require('express');
const router = express.Router();
const Vendor = require('../models/Vendor');
const authMiddleware = require('../middleware/authMiddleware');

const authFile = require('../middleware/authMiddleware.js');

const requireOwner = authFile.requireOwner || ((req, res, next) => {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ message: 'Access denied: Owner only' });
  }
  next();
});

// 📋 GET ALL VENDORS
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { category, isActive = 'true', search } = req.query;

    const query = { isActive: isActive === 'true' };

    if (category) {
      query.categories = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const vendors = await Vendor.find(query)
      .sort({ 'performance.qualityRating': -1 })
      .lean();

    res.json({
      success: true,
      vendors
    });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors'
    });
  }
});

// 🆕 CREATE VENDOR (Admin only)
router.post('/create', authMiddleware, requireOwner, async (req, res) => {
  try {
    const vendorData = req.body;

    const vendor = new Vendor(vendorData);
    await vendor.save();

    res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      vendor
    });
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create vendor'
    });
  }
});

// 🔍 GET VENDOR BY ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      vendor
    });
  } catch (error) {
    console.error('Get vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor'
    });
  }
});

// ✏️ UPDATE VENDOR (Admin only)
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

// 🗑️ DELETE VENDOR (Soft delete - Admin only)
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

module.exports = router;
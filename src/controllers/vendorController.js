const Vendor = require('../models/Vendor');

// Get All Vendors
exports.getVendors = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status, 
      category,
      sortBy = '-createdAt'
    } = req.query;

    const query = { isDeleted: false };

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { vendorCode: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    const vendors = await Vendor.find(query)
      .sort(sortBy)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const totalVendors = await Vendor.countDocuments(query);

    res.json({
      success: true,
      vendors,
      totalPages: Math.ceil(totalVendors / limit),
      currentPage: parseInt(page),
      totalVendors
    });

  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch vendors',
      error: error.message 
    });
  }
};

// Get Vendor by ID
exports.getVendorById = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendor = await Vendor.findById(vendorId).lean();

    if (!vendor || vendor.isDeleted) {
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
    console.error('Get vendor by ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch vendor details',
      error: error.message 
    });
  }
};

// Create Vendor
exports.createVendor = async (req, res) => {
  try {
    const vendorData = req.body;

    // Check if vendor with same email or phone exists
    const existingVendor = await Vendor.findOne({
      $or: [
        { email: vendorData.email },
        { phone: vendorData.phone }
      ],
      isDeleted: false
    });

    if (existingVendor) {
      return res.status(400).json({
        success: false,
        message: existingVendor.email === vendorData.email 
          ? 'Vendor with this email already exists'
          : 'Vendor with this phone number already exists'
      });
    }

    // Create new vendor
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
      message: 'Failed to create vendor',
      error: error.message 
    });
  }
};

// Update Vendor
exports.updateVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const updates = req.body;

    // Don't allow updating certain fields
    delete updates._id;
    delete updates.vendorCode;
    delete updates.totalOrders;
    delete updates.activeOrders;
    delete updates.totalValue;
    delete updates.createdAt;
    delete updates.updatedAt;

    const vendor = await Vendor.findByIdAndUpdate(
      vendorId,
      updates,
      { new: true, runValidators: true }
    );

    if (!vendor || vendor.isDeleted) {
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
      message: 'Failed to update vendor',
      error: error.message 
    });
  }
};

// Delete Vendor (Soft Delete)
exports.deleteVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendor = await Vendor.findByIdAndUpdate(
      vendorId,
      { isDeleted: true, status: 'Inactive' },
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
      message: 'Vendor deleted successfully'
    });

  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete vendor',
      error: error.message 
    });
  }
};

// Toggle Vendor Status
exports.toggleVendorStatus = async (req, res) => {
  try {
    const { vendorId } = req.params;

    const vendor = await Vendor.findById(vendorId);

    if (!vendor || vendor.isDeleted) {
      return res.status(404).json({ 
        success: false, 
        message: 'Vendor not found' 
      });
    }

    vendor.status = vendor.status === 'Active' ? 'Inactive' : 'Active';
    await vendor.save();

    res.json({
      success: true,
      message: `Vendor ${vendor.status === 'Active' ? 'activated' : 'deactivated'} successfully`,
      vendor
    });

  } catch (error) {
    console.error('Toggle vendor status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to toggle vendor status',
      error: error.message 
    });
  }
};

// Get Vendor Statistics
exports.getVendorStats = async (req, res) => {
  try {
    const [
      totalVendors,
      activeVendors,
      inactiveVendors,
      totalOrdersSum,
      activeOrdersSum,
      totalValueSum
    ] = await Promise.all([
      Vendor.countDocuments({ isDeleted: false }),
      Vendor.countDocuments({ status: 'Active', isDeleted: false }),
      Vendor.countDocuments({ status: 'Inactive', isDeleted: false }),
      Vendor.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$totalOrders' } } }
      ]),
      Vendor.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$activeOrders' } } }
      ]),
      Vendor.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$totalValue' } } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalVendors,
        activeVendors,
        inactiveVendors,
        totalOrders: totalOrdersSum[0]?.total || 0,
        activeOrders: activeOrdersSum[0]?.total || 0,
        totalValue: totalValueSum[0]?.total || 0
      }
    });

  } catch (error) {
    console.error('Get vendor stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch vendor statistics',
      error: error.message 
    });
  }
};

// Update Vendor Rating
exports.updateVendorRating = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { rating } = req.body;

    if (rating < 0 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 0 and 5'
      });
    }

    const vendor = await Vendor.findByIdAndUpdate(
      vendorId,
      { rating },
      { new: true }
    );

    if (!vendor || vendor.isDeleted) {
      return res.status(404).json({ 
        success: false, 
        message: 'Vendor not found' 
      });
    }

    res.json({
      success: true,
      message: 'Vendor rating updated successfully',
      vendor
    });

  } catch (error) {
    console.error('Update vendor rating error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update vendor rating',
      error: error.message 
    });
  }
};

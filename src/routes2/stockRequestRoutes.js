// backend/src/routes/stockRequestRoutes.js
const express = require('express');
const router = express.Router();
const StockRequest = require('../models/StockRequest');
const Tablet = require('../models/Tablet');
const Vendor = require('../models/Vendor');
const authMiddleware = require('../middleware/authMiddleware');

const authFile = require('../middleware/authMiddleware.js');

const requireOwner = authFile.requireOwner || ((req, res, next) => {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ message: 'Access denied: Owner only' });
  }
  next();
});


// CREATE STOCK REQUEST (Worker only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      tabletId,
      requestedQuantity,
      urgencyLevel = 'Medium',
      reason,
      preferredVendor,
      estimatedCost,
      requestedDeliveryDate
    } = req.body;

    // Check if tablet exists
    const tablet = await Tablet.findById(tabletId);
    if (!tablet) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    // Check if there's already a pending request for this tablet
    const existingRequest = await StockRequest.findOne({
      tablet: tabletId,
      status: { $in: ['Pending', 'Under Review', 'Approved', 'Ordered'] }
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'A stock request for this medicine is already in progress'
      });
    }

    const stockRequest = new StockRequest({
      tablet: tabletId,
      requestedBy: req.user.id,
      currentStock: tablet.stock,
      requestedQuantity,
      urgencyLevel,
      reason,
      preferredVendor,
      estimatedCost,
      requestedDeliveryDate: requestedDeliveryDate ? new Date(requestedDeliveryDate) : null,
      isUrgent: urgencyLevel === 'Critical' || tablet.stock <= tablet.minStockLevel
    });

    await stockRequest.save();

    // Populate the response
    await stockRequest.populate([
      { path: 'tablet', select: 'name brand company strength category' },
      { path: 'preferredVendor', select: 'name company' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Stock request created successfully',
      stockRequest
    });

  } catch (error) {
    console.error('Create stock request error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create stock request'
    });
  }
});

// GET STOCK REQUESTS
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      urgencyLevel, 
      startDate, 
      endDate 
    } = req.query;
    
    const userId = req.user.id;
    const userRole = req.user.role;

    const query = {};

    // Workers can only see their own requests
    if (userRole === 'worker') {
      query.requestedBy = userId;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by urgency level
    if (urgencyLevel) {
      query.urgencyLevel = urgencyLevel;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const stockRequests = await StockRequest.find(query)
      .populate([
        { path: 'tablet', select: 'name brand company strength category' },
        { path: 'requestedBy', select: 'name employeeId' },
        { path: 'preferredVendor', select: 'name company' },
        { path: 'reviewedBy', select: 'name' },
        { path: 'orderDetails.vendor', select: 'name company' }
      ])
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const totalRequests = await StockRequest.countDocuments(query);

    res.json({
      success: true,
      stockRequests,
      totalPages: Math.ceil(totalRequests / limit),
      currentPage: page,
      totalRequests
    });

  } catch (error) {
    console.error('Get stock requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stock requests'
    });
  }
});

// REVIEW STOCK REQUEST (Owner only)
router.put('/:id/review', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { status, adminNotes, vendor, orderDate, expectedDeliveryDate } = req.body;
    const requestId = req.params.id;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either Approved or Rejected'
      });
    }

    const updateData = {
      status,
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
      adminNotes
    };

    // If approved, add order details
    if (status === 'Approved' && vendor) {
      updateData.status = 'Ordered';
      updateData.orderDetails = {
        vendor,
        orderDate: orderDate ? new Date(orderDate) : new Date(),
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null
      };
    }

    const stockRequest = await StockRequest.findByIdAndUpdate(
      requestId,
      updateData,
      { new: true }
    ).populate([
      { path: 'tablet', select: 'name brand company' },
      { path: 'requestedBy', select: 'name employeeId' },
      { path: 'reviewedBy', select: 'name' }
    ]);

    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    res.json({
      success: true,
      message: `Stock request ${status.toLowerCase()} successfully`,
      stockRequest
    });

  } catch (error) {
    console.error('Review stock request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review stock request'
    });
  }
});

// MARK AS RECEIVED (Owner only)
router.put('/:id/receive', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { receivedQuantity, invoiceNumber, totalCost, actualDeliveryDate } = req.body;
    const requestId = req.params.id;

    const stockRequest = await StockRequest.findById(requestId).populate('tablet');
    
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: 'Stock request not found'
      });
    }

    if (stockRequest.status !== 'Ordered') {
      return res.status(400).json({
        success: false,
        message: 'Stock request must be in Ordered status'
      });
    }

    // Update stock request
    stockRequest.status = 'Received';
    stockRequest.orderDetails.receivedQuantity = receivedQuantity;
    stockRequest.orderDetails.invoiceNumber = invoiceNumber;
    stockRequest.orderDetails.totalCost = totalCost;
    stockRequest.orderDetails.actualDeliveryDate = actualDeliveryDate ? new Date(actualDeliveryDate) : new Date();

    await stockRequest.save();

    // Update tablet stock
    const tablet = stockRequest.tablet;
    tablet.stock += receivedQuantity;
    await tablet.save();

    res.json({
      success: true,
      message: 'Stock received and inventory updated successfully',
      stockRequest
    });

  } catch (error) {
    console.error('Receive stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process stock receipt'
    });
  }
});

// GET REQUEST ANALYTICS (Owner only)
router.get('/analytics', authMiddleware, requireOwner, async (req, res) => {
  try {
    const analytics = await StockRequest.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const urgencyAnalytics = await StockRequest.aggregate([
      {
        $group: {
          _id: '$urgencyLevel',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      analytics: {
        byStatus: analytics,
        byUrgency: urgencyAnalytics
      }
    });

  } catch (error) {
    console.error('Stock request analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
});

module.exports = router;
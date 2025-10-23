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

// 📦 WORKER: GET ALL MY REQUESTS
router.get('/my-requests', authMiddleware, async (req, res) => {
  try {
    const requests = await StockRequest.find({ requestedBy: req.user.id })
      .populate('tablet', 'name brand company strength price category')
      .populate('preferredVendor', 'name phone email')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      requests
    });
  } catch (error) {
    console.error('Get my requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your requests'
    });
  }
});

// ➕ WORKER: CREATE STOCK REQUEST
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { tabletId, requestedQuantity, urgencyLevel, reason, preferredVendor, estimatedCost } = req.body;

    // Validate required fields
    if (!tabletId || !requestedQuantity || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Tablet ID, quantity, and reason are required'
      });
    }

    // Check if tablet exists
    const tablet = await Tablet.findById(tabletId);
    if (!tablet) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    // Create stock request
    const stockRequest = new StockRequest({
      tablet: tabletId,
      requestedBy: req.user.id,
      currentStock: tablet.stock,
      requestedQuantity,
      urgencyLevel: urgencyLevel || 'Medium',
      reason,
      preferredVendor: preferredVendor || null,
      estimatedCost: estimatedCost || null,
      isUrgent: urgencyLevel === 'Critical' || tablet.stock === 0
    });

    await stockRequest.save();

    // Populate response
    await stockRequest.populate([
      { path: 'tablet', select: 'name brand company strength price category' },
      { path: 'preferredVendor', select: 'name phone email' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Stock request created successfully',
      request: stockRequest
    });
  } catch (error) {
    console.error('Create stock request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create stock request'
    });
  }
});

// 📋 WORKER: CREATE BULK STOCK REQUESTS
router.post('/create-bulk', authMiddleware, async (req, res) => {
  try {
    const { requests } = req.body;

    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Requests array is required'
      });
    }

    const createdRequests = [];
    const errors = [];

    for (const reqData of requests) {
      try {
        const tablet = await Tablet.findById(reqData.tabletId);
        if (!tablet) {
          errors.push({ tabletId: reqData.tabletId, error: 'Medicine not found' });
          continue;
        }

        const stockRequest = new StockRequest({
          tablet: reqData.tabletId,
          requestedBy: req.user.id,
          currentStock: tablet.stock,
          requestedQuantity: reqData.quantity,
          urgencyLevel: reqData.urgencyLevel || 'Medium',
          reason: reqData.reason || 'Stock replenishment needed',
          preferredVendor: reqData.preferredVendor || null,
          estimatedCost: reqData.estimatedCost || null,
          isUrgent: reqData.urgencyLevel === 'Critical' || tablet.stock === 0
        });

        await stockRequest.save();
        createdRequests.push(stockRequest);
      } catch (error) {
        errors.push({ tabletId: reqData.tabletId, error: error.message });
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${createdRequests.length} stock requests`,
      created: createdRequests.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Create bulk stock requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create stock requests'
    });
  }
});

// 📊 ADMIN: GET ALL REQUESTS (with filters)
router.get('/all', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { status, urgencyLevel, search, page = 1, limit = 20 } = req.query;

    const query = {};

    if (status) query.status = status;
    if (urgencyLevel) query.urgencyLevel = urgencyLevel;
    if (search) {
      query.$or = [
        { requestNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const requests = await StockRequest.find(query)
      .populate('tablet', 'name brand company strength price category stock')
      .populate('requestedBy', 'name email employeeId')
      .populate('preferredVendor', 'name phone email')
      .populate('reviewedBy', 'name')
      .populate('orderDetails.vendor', 'name phone email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const totalRequests = await StockRequest.countDocuments(query);

    res.json({
      success: true,
      requests,
      totalPages: Math.ceil(totalRequests / limit),
      currentPage: parseInt(page),
      totalRequests
    });
  } catch (error) {
    console.error('Get all requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch requests'
    });
  }
});

// ✅ ADMIN: APPROVE REQUEST
router.put('/:requestId/approve', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { vendorId, adminNotes, expectedDeliveryDate } = req.body;

    const request = await StockRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    if (request.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending requests can be approved'
      });
    }

    request.status = 'Approved';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    request.adminNotes = adminNotes;
    
    if (vendorId) {
      request.orderDetails.vendor = vendorId;
    }
    if (expectedDeliveryDate) {
      request.orderDetails.expectedDeliveryDate = expectedDeliveryDate;
    }

    await request.save();

    await request.populate([
      { path: 'tablet', select: 'name brand company strength price' },
      { path: 'requestedBy', select: 'name email' },
      { path: 'orderDetails.vendor', select: 'name phone email' }
    ]);

    res.json({
      success: true,
      message: 'Request approved successfully',
      request
    });
  } catch (error) {
    console.error('Approve request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve request'
    });
  }
});

// ❌ ADMIN: REJECT REQUEST
router.put('/:requestId/reject', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { adminNotes } = req.body;

    if (!adminNotes) {
      return res.status(400).json({
        success: false,
        message: 'Reason for rejection is required'
      });
    }

    const request = await StockRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    if (request.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending requests can be rejected'
      });
    }

    request.status = 'Rejected';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    request.adminNotes = adminNotes;

    await request.save();

    res.json({
      success: true,
      message: 'Request rejected',
      request
    });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject request'
    });
  }
});

// 📦 ADMIN: MARK AS ORDERED
router.put('/:requestId/mark-ordered', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { invoiceNumber, totalCost, orderDate } = req.body;

    const request = await StockRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    if (request.status !== 'Approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved requests can be marked as ordered'
      });
    }

    request.status = 'Ordered';
    request.orderDetails.orderDate = orderDate || new Date();
    request.orderDetails.invoiceNumber = invoiceNumber;
    request.orderDetails.totalCost = totalCost;

    await request.save();

    res.json({
      success: true,
      message: 'Request marked as ordered',
      request
    });
  } catch (error) {
    console.error('Mark as ordered error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark as ordered'
    });
  }
});

// ✅ ADMIN: MARK AS RECEIVED
router.put('/:requestId/mark-received', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { receivedQuantity, actualDeliveryDate } = req.body;

    const request = await StockRequest.findById(requestId)
      .populate('tablet');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    if (request.status !== 'Ordered') {
      return res.status(400).json({
        success: false,
        message: 'Only ordered requests can be marked as received'
      });
    }

    // Update request
    request.status = 'Received';
    request.orderDetails.receivedQuantity = receivedQuantity || request.requestedQuantity;
    request.orderDetails.actualDeliveryDate = actualDeliveryDate || new Date();

    await request.save();

    // Update tablet stock
    if (request.tablet) {
      request.tablet.stock += receivedQuantity || request.requestedQuantity;
      await request.tablet.save();
    }

    res.json({
      success: true,
      message: 'Stock received and inventory updated',
      request
    });
  } catch (error) {
    console.error('Mark as received error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark as received'
    });
  }
});

// 📊 GET DASHBOARD STATS
router.get('/stats', authMiddleware, requireOwner, async (req, res) => {
  try {
    const [pending, approved, ordered, critical] = await Promise.all([
      StockRequest.countDocuments({ status: 'Pending' }),
      StockRequest.countDocuments({ status: 'Approved' }),
      StockRequest.countDocuments({ status: 'Ordered' }),
      StockRequest.countDocuments({ urgencyLevel: 'Critical', status: { $in: ['Pending', 'Approved'] } })
    ]);

    const recentRequests = await StockRequest.find()
      .populate('tablet', 'name brand')
      .populate('requestedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      stats: {
        pending,
        approved,
        ordered,
        critical,
        total: pending + approved + ordered
      },
      recentRequests
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats'
    });
  }
});

module.exports = router;
// backend/src/routes/workerRoutes.js
const express = require('express');
const router = express.Router();
const Worker = require('../models/Worker');
const authMiddleware = require('../middleware/authMiddleware');

const authFile = require('../middleware/authMiddleware.js');

const requireOwner = authFile.requireOwner || ((req, res, next) => {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ message: 'Access denied: Owner only' });
  }
  next();
});
// 👥 GET ALL WORKERS (Owner only)
router.get('/', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, department, isActive } = req.query;

    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    if (department) {
      query.department = department;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const workers = await Worker.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const totalWorkers = await Worker.countDocuments(query);

    res.json({
      success: true,
      workers,
      totalPages: Math.ceil(totalWorkers / limit),
      currentPage: page,
      totalWorkers
    });

  } catch (error) {
    console.error('Get workers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch workers'
    });
  }
});

// 👤 GET WORKER PROFILE
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const worker = await Worker.findById(req.user.id).select('-password');
    
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    res.json({
      success: true,
      worker
    });

  } catch (error) {
    console.error('Get worker profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker profile'
    });
  }
});

module.exports = router;

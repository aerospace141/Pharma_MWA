// backend/src/routes/vendorRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const vendorController = require('../controllers/vendorController');

// Get auth file
const authFile = require('../middleware/authMiddleware.js');
const requireOwner = authFile.requireOwner || ((req, res, next) => {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ message: 'Access denied: Owner only' });
  }
  next();
});

// All routes require owner authentication
router.use(authMiddleware, requireOwner);

// Vendor CRUD Routes
router.get('/', vendorController.getVendors);
router.get('/stats', vendorController.getVendorStats);
router.get('/:vendorId', vendorController.getVendorById);
router.post('/create', vendorController.createVendor);
router.put('/:vendorId', vendorController.updateVendor);
router.delete('/:vendorId', vendorController.deleteVendor);
router.patch('/:vendorId/toggle-status', vendorController.toggleVendorStatus);
router.patch('/:vendorId/rating', vendorController.updateVendorRating);

module.exports = router;
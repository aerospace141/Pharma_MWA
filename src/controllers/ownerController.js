// backend/src/controllers/ownerController.js
const Worker = require('../models/Worker');
const Tablet = require('../models/Tablet');
const Bill = require('../models/Bill');
const Cart = require('../models/Cart');
const mongoose = require('mongoose');

const requireOwner = require('../middleware/authMiddleware').requireOwner;
const StockRequest = require('../models/StockRequest');

// Helper function to get date range
const getDateRange = (period) => {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case 'month':
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case 'year':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
    default:
      startDate = new Date(now.setHours(0, 0, 0, 0));
  }

  return { startDate, endDate: new Date() };
};

// ===== DASHBOARD CONTROLLERS =====

// Get Dashboard Stats
exports.getDashboardStats = async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Get previous period for comparison
    const periodLength = endDate - startDate;
    const prevStartDate = new Date(startDate - periodLength);
    const prevEndDate = startDate;

    // Current period stats
    const [
      currentBills,
      prevBills,
      activeWorkers,
      totalMedicines,
      lowStockCount
    ] = await Promise.all([
      Bill.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate }, status: 'Completed' } },
        { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),
      Bill.aggregate([
        { $match: { createdAt: { $gte: prevStartDate, $lt: prevEndDate }, status: 'Completed' } },
        { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
      ]),
      Worker.countDocuments({ isActive: true }),
      Tablet.countDocuments({ isActive: true }),
      Tablet.countDocuments({ stock: { $lte: 10 }, isActive: true })
    ]);

    const currentStats = currentBills[0] || { totalRevenue: 0, count: 0 };
    const prevStats = prevBills[0] || { totalRevenue: 0, count: 0 };

    // Calculate changes
    const revenueChange = prevStats.totalRevenue > 0 
      ? ((currentStats.totalRevenue - prevStats.totalRevenue) / prevStats.totalRevenue * 100).toFixed(1)
      : 0;
    
    const billsChange = prevStats.count > 0
      ? ((currentStats.count - prevStats.count) / prevStats.count * 100).toFixed(1)
      : 0;

    const avgOrderValue = currentStats.count > 0 
      ? (currentStats.totalRevenue / currentStats.count).toFixed(2)
      : 0;

    const prevAvgOrderValue = prevStats.count > 0
      ? (prevStats.totalRevenue / prevStats.count).toFixed(2)
      : 0;

    const aovChange = prevAvgOrderValue > 0
      ? ((avgOrderValue - prevAvgOrderValue) / prevAvgOrderValue * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      totalRevenue: currentStats.totalRevenue,
      revenueChange: parseFloat(revenueChange),
      totalBills: currentStats.count,
      billsChange: parseFloat(billsChange),
      activeWorkers,
      workersChange: 0, // Can be calculated if needed
      avgOrderValue: parseFloat(avgOrderValue),
      aovChange: parseFloat(aovChange),
      totalMedicines,
      lowStockCount
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
  }
};

// ===== WORKER PERFORMANCE CONTROLLERS =====

// Get Worker Performance
exports.getWorkerPerformance = async (req, res) => {
  try {
    const { period = 'today', limit = 10 } = req.query;
    const { startDate, endDate } = getDateRange(period);

    const performance = await Bill.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate }, status: 'Completed' } },
      {
        $group: {
          _id: '$worker',
          totalSales: { $sum: '$totalAmount' },
          totalBills: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' }
        }
      },
      { $sort: { totalSales: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'workers',
          localField: '_id',
          foreignField: '_id',
          as: 'workerInfo'
        }
      },
      { $unwind: '$workerInfo' },
      {
        $project: {
          _id: 1,
          name: '$workerInfo.name',
          employeeId: '$workerInfo.employeeId',
          department: '$workerInfo.department',
          totalSales: 1,
          totalBills: 1,
          avgOrderValue: { $round: ['$avgOrderValue', 2] }
        }
      }
    ]);

    res.json(performance);

  } catch (error) {
    console.error('Get worker performance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch worker performance' });
  }
};

// Get Worker Details
// exports.getWorkerDetails = async (req, res) => {
//   try {
//     const { workerId } = req.params;
//     const { period = 'month' } = req.query;
//     const { startDate, endDate } = getDateRange(period);

//     const worker = await Worker.findById(workerId).select('-password');
//     if (!worker) {
//       return res.status(404).json({ success: false, message: 'Worker not found' });
//     }

//     // Get worker's sales stats
//     const stats = await Bill.aggregate([
//       { $match: { worker: mongoose.Types.ObjectId(workerId), createdAt: { $gte: startDate, $lte: endDate }, status: 'Completed' } },
//       {
//         $group: {
//           _id: null,
//           totalSales: { $sum: '$totalAmount' },
//           totalBills: { $sum: 1 },
//           avgOrderValue: { $avg: '$totalAmount' }
//         }
//       }
//     ]);

//     // Get top selling medicines by this worker
//     const topMedicines = await Bill.aggregate([
//       { $match: { worker: mongoose.Types.ObjectId(workerId), createdAt: { $gte: startDate, $lte: endDate }, status: 'Completed' } },
//       { $unwind: '$items' },
//       {
//         $group: {
//           _id: '$items.tablet',
//           name: { $first: '$items.name' },
//           totalQuantity: { $sum: '$items.quantity' },
//           totalRevenue: { $sum: '$items.totalPrice' }
//         }
//       },
//       { $sort: { totalQuantity: -1 } },
//       { $limit: 5 }
//     ]);

//     // Daily sales for the period
//     const dailySales = await Bill.aggregate([
//       { $match: { worker: mongoose.Types.ObjectId(workerId), createdAt: { $gte: startDate, $lte: endDate }, status: 'Completed' } },
//       {
//         $group: {
//           _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
//           sales: { $sum: '$totalAmount' },
//           bills: { $sum: 1 }
//         }
//       },
//       { $sort: { _id: 1 } }
//     ]);

//     res.json({
//       success: true,
//       worker,
//       stats: stats[0] || { totalSales: 0, totalBills: 0, avgOrderValue: 0 },
//       topMedicines,
//       dailySales
//     });

//   } catch (error) {
//     console.error('Get worker details error:', error);
//     res.status(500).json({ success: false, message: 'Failed to fetch worker details' });
//   }
// };

exports.getWorkerDetails = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { period = 'month' } = req.query;

    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      return res.status(400).json({ success: false, message: 'Invalid worker ID' });
    }

    const { startDate, endDate } = getDateRange(period);
    const worker = await Worker.findById(workerId).select('-password');
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

    const matchQuery = { worker: new mongoose.Types.ObjectId(workerId), createdAt: { $gte: startDate, $lte: endDate }, status: 'Completed' };

    const [stats, topMedicines, dailySales] = await Promise.all([
      Bill.aggregate([{ $match: matchQuery }, { $group: { _id: null, totalSales: { $sum: '$totalAmount' }, totalBills: { $sum: 1 }, avgOrderValue: { $avg: '$totalAmount' } } }]),
      Bill.aggregate([{ $match: matchQuery }, { $unwind: '$items' }, { $group: { _id: '$items.tablet', name: { $first: '$items.name' }, totalQuantity: { $sum: '$items.quantity' }, totalRevenue: { $sum: '$items.totalPrice' } } }, { $sort: { totalQuantity: -1 } }, { $limit: 5 }]),
      Bill.aggregate([{ $match: matchQuery }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, sales: { $sum: '$totalAmount' }, bills: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    ]);

    res.json({
      success: true,
      worker,
      stats: stats[0] || { totalSales: 0, totalBills: 0, avgOrderValue: 0 },
      topMedicines,
      dailySales
    });

  } catch (error) {
    console.error('Get worker details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch worker details' });
  }
};


// Get Worker Sales History
exports.getWorkerSalesHistory = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { page = 1, limit = 20, startDate, endDate } = req.query;

    const query = { worker: workerId, status: 'Completed' };
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const bills = await Bill.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('items.tablet', 'name brand company')
      .lean();

    const totalBills = await Bill.countDocuments(query);

    res.json({
      success: true,
      bills,
      totalPages: Math.ceil(totalBills / limit),
      currentPage: page,
      totalBills
    });

  } catch (error) {
    console.error('Get worker sales history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sales history' });
  }
};

// ===== INVENTORY CONTROLLERS =====

// Get Stock Alerts
exports.getStockAlerts = async (req, res) => {
  try {
    // Get medicines with stock issues
    const medicines = await Tablet.find({ isActive: true }).lean();

    // Analyze each medicine for alerts
    const alerts = [];
    
    for (const medicine of medicines) {
      // Check if out of stock
      if (medicine.stock === 0) {
        alerts.push({
          ...medicine,
          type: 'out_of_stock',
          severity: 'critical',
          message: 'Out of stock'
        });
        continue;
      }

      // Check if low stock
      if (medicine.stock <= medicine.minStockLevel) {
        alerts.push({
          ...medicine,
          type: 'low_stock',
          severity: 'high',
          message: `Only ${medicine.stock} units left`
        });
      }

      // Check for demand spike (comparing last 7 days vs previous 7 days)
      const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const prev7Days = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const [recentSales, previousSales] = await Promise.all([
        Bill.aggregate([
          { $match: { createdAt: { $gte: last7Days }, status: 'Completed' } },
          { $unwind: '$items' },
          { $match: { 'items.tablet': medicine._id } },
          { $group: { _id: null, total: { $sum: '$items.quantity' } } }
        ]),
        Bill.aggregate([
          { $match: { createdAt: { $gte: prev7Days, $lt: last7Days }, status: 'Completed' } },
          { $unwind: '$items' },
          { $match: { 'items.tablet': medicine._id } },
          { $group: { _id: null, total: { $sum: '$items.quantity' } } }
        ])
      ]);

      const recentTotal = recentSales[0]?.total || 0;
      const previousTotal = previousSales[0]?.total || 0;

      // If recent sales are 50% higher than previous period, it's a demand spike
      if (previousTotal > 0 && recentTotal > previousTotal * 1.5) {
        alerts.push({
          ...medicine,
          type: 'high_demand',
          severity: 'medium',
          message: 'Sudden increase in demand detected',
          demandSpike: true,
          recentSales: recentTotal,
          previousSales: previousTotal
        });
      } else if (recentTotal > 0) {
        // Mark as steady demand
        medicine.steadyDemand = true;
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    res.json(alerts);

  } catch (error) {
    console.error('Get stock alerts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stock alerts' });
  }
};

// Get Inventory Overview
exports.getInventoryOverview = async (req, res) => {
  try {
    const [
      totalMedicines,
      outOfStock,
      lowStock,
      totalValue,
      categoryBreakdown
    ] = await Promise.all([
      Tablet.countDocuments({ isActive: true }),
      Tablet.countDocuments({ stock: 0, isActive: true }),
      Tablet.countDocuments({ $expr: { $lte: ['$stock', '$minStockLevel'] }, isActive: true }),
      Tablet.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, total: { $sum: { $multiply: ['$stock', '$price'] } } } }
      ]),
      Tablet.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$category', count: { $sum: 1 }, totalStock: { $sum: '$stock' } } },
        { $sort: { count: -1 } }
      ])
    ]);

    res.json({
      success: true,
      totalMedicines,
      outOfStock,
      lowStock,
      totalValue: totalValue[0]?.total || 0,
      categoryBreakdown
    });

  } catch (error) {
    console.error('Get inventory overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch inventory overview' });
  }
};

// ===== SALES TRENDS CONTROLLERS =====

// Get Sales Trends
exports.getSalesTrends = async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Get previous period for comparison
    const periodLength = endDate - startDate;
    const prevStartDate = new Date(startDate - periodLength);

    // Get top selling medicines with growth rate
    const trends = await Bill.aggregate([
      { $match: { createdAt: { $gte: prevStartDate, $lte: endDate }, status: 'Completed' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.tablet',
          name: { $first: '$items.name' },
          brand: { $first: '$items.brand' },
          category: { $first: 'General' },
          currentSales: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', startDate] }, '$items.quantity', 0]
            }
          },
          previousSales: {
            $sum: {
              $cond: [{ $lt: ['$createdAt', startDate] }, '$items.quantity', 0]
            }
          },
          soldCount: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.totalPrice' }
        }
      },
      {
        $addFields: {
          growth: {
            $cond: [
              { $eq: ['$previousSales', 0] },
              100,
              {
                $multiply: [
                  { $divide: [{ $subtract: ['$currentSales', '$previousSales'] }, '$previousSales'] },
                  100
                ]
              }
            ]
          }
        }
      },
      { $sort: { soldCount: -1 } },
      { $limit: 10 },
      {
        $project: {
          name: 1,
          brand: 1,
          category: 1,
          soldCount: 1,
          revenue: 1,
          growth: { $round: ['$growth', 1] }
        }
      }
    ]);

    res.json(trends);

  } catch (error) {
    console.error('Get sales trends error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sales trends' });
  }
};

// Get Critical Alerts
exports.getCriticalAlerts = async (req, res) => {
  try {
    const criticalAlerts = [];

    // Check for out of stock high-demand items
    const outOfStockHighDemand = await Tablet.find({
      stock: 0,
      popularity: { $gte: 50 },
      isActive: true
    }).limit(5);

    outOfStockHighDemand.forEach(item => {
      criticalAlerts.push({
        type: 'critical_stock',
        severity: 'critical',
        message: `${item.name} is out of stock (high demand item)`,
        medicineId: item._id,
        medicineName: item.name
      });
    });

    // Check for expiring medicines (within 30 days)
    const expiringMedicines = await Tablet.find({
      expiryDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), $gte: new Date() },
      stock: { $gt: 0 },
      isActive: true
    }).limit(5);

    expiringMedicines.forEach(item => {
      criticalAlerts.push({
        type: 'expiry_alert',
        severity: 'high',
        message: `${item.name} expiring soon (${item.stock} units)`,
        medicineId: item._id,
        medicineName: item.name,
        expiryDate: item.expiryDate
      });
    });

    res.json(criticalAlerts);

  } catch (error) {
    console.error('Get critical alerts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch critical alerts' });
  }
};

// Additional controllers will be added in the next part...


// backend/src/controllers/ownerController.js - Part 2

// ===== MEDICINE MANAGEMENT CONTROLLERS =====

// Get All Medicines
exports.getAllMedicines = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category, stockStatus, sortBy = '-createdAt' } = req.query;

    const query = { isActive: true };

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Stock status filter
    if (stockStatus) {
      switch (stockStatus) {
        case 'out_of_stock':
          query.stock = 0;
          break;
        case 'low_stock':
          query.$expr = { $lte: ['$stock', '$minStockLevel'] };
          break;
        case 'in_stock':
          query.$expr = { $gt: ['$stock', '$minStockLevel'] };
          break;
      }
    }

    const medicines = await Tablet.find(query)
      .sort(sortBy)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const totalMedicines = await Tablet.countDocuments(query);

    res.json({
      success: true,
      medicines,
      totalPages: Math.ceil(totalMedicines / limit),
      currentPage: parseInt(page),
      totalMedicines
    });

  } catch (error) {
    console.error('Get all medicines error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch medicines' });
  }
};

// Create Medicine
exports.createMedicine = async (req, res) => {
  try {
    const medicineData = req.body;

    // Validate required fields
    const requiredFields = ['name', 'brand', 'company', 'strength', 'price', 'category'];
    const missingFields = requiredFields.filter(field => !medicineData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Check if medicine already exists
    const existingMedicine = await Tablet.findOne({
      name: medicineData.name,
      brand: medicineData.brand,
      strength: medicineData.strength
    });

    if (existingMedicine) {
      return res.status(400).json({
        success: false,
        message: 'Medicine with same name, brand and strength already exists'
      });
    }

    // Create new medicine
    const medicine = new Tablet(medicineData);
    await medicine.save();

    res.status(201).json({
      success: true,
      message: 'Medicine created successfully',
      medicine
    });

  } catch (error) {
    console.error('Create medicine error:', error);
    res.status(500).json({ success: false, message: 'Failed to create medicine' });
  }
};

// Update Medicine
exports.updateMedicine = async (req, res) => {
  try {
    const { medicineId } = req.params;
    const updates = req.body;

    // Don't allow updating certain fields
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;

    // If price is being updated, add to price history
    if (updates.price) {
      const medicine = await Tablet.findById(medicineId);
      if (medicine && medicine.price !== updates.price) {
        updates.$push = {
          priceHistory: {
            price: updates.price,
            date: new Date(),
            reason: updates.priceChangeReason || 'Manual update'
          }
        };
        delete updates.priceChangeReason;
      }
    }

    const medicine = await Tablet.findByIdAndUpdate(
      medicineId,
      updates,
      { new: true, runValidators: true }
    );

    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    res.json({
      success: true,
      message: 'Medicine updated successfully',
      medicine
    });

  } catch (error) {
    console.error('Update medicine error:', error);
    res.status(500).json({ success: false, message: 'Failed to update medicine' });
  }
};

// Delete Medicine
exports.deleteMedicine = async (req, res) => {
  try {
    const { medicineId } = req.params;

    // Soft delete - just mark as inactive
    const medicine = await Tablet.findByIdAndUpdate(
      medicineId,
      { isActive: false },
      { new: true }
    );

    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    res.json({
      success: true,
      message: 'Medicine deleted successfully'
    });

  } catch (error) {
    console.error('Delete medicine error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete medicine' });
  }
};

// Update Stock
exports.updateStock = async (req, res) => {
  try {
    const { medicineId } = req.params;
    const { quantity, type = 'add' } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    const medicine = await Tablet.findById(medicineId);
    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    // Update stock based on type
    if (type === 'add') {
      medicine.stock += quantity;
    } else if (type === 'subtract') {
      if (medicine.stock < quantity) {
        return res.status(400).json({ success: false, message: 'Insufficient stock' });
      }
      medicine.stock -= quantity;
    } else if (type === 'set') {
      medicine.stock = quantity;
    }

    await medicine.save();

    res.json({
      success: true,
      message: 'Stock updated successfully',
      medicine
    });

  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({ success: false, message: 'Failed to update stock' });
  }
};

// Bulk Update Stock
exports.bulkUpdateStock = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid updates data' });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const medicine = await Tablet.findById(update.medicineId);
        if (!medicine) {
          errors.push({ medicineId: update.medicineId, error: 'Medicine not found' });
          continue;
        }

        if (update.type === 'add') {
          medicine.stock += update.quantity;
        } else if (update.type === 'set') {
          medicine.stock = update.quantity;
        }

        await medicine.save();
        results.push({ medicineId: update.medicineId, newStock: medicine.stock });
      } catch (error) {
        errors.push({ medicineId: update.medicineId, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Updated ${results.length} medicines`,
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Bulk update stock error:', error);
    res.status(500).json({ success: false, message: 'Failed to bulk update stock' });
  }
};

// ===== WORKER MANAGEMENT CONTROLLERS =====

// Get All Workers
exports.getAllWorkers = async (req, res) => {
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
      currentPage: parseInt(page),
      totalWorkers
    });

  } catch (error) {
    console.error('Get all workers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch workers' });
  }
};

// Create Worker
exports.createWorker = async (req, res) => {
  try {
    const { name, email, password, phone, employeeId, department } = req.body;

    // Validate required fields
    if (!name || !email || !password || !phone || !employeeId) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    // Check if worker already exists
    const existingWorker = await Worker.findOne({
      $or: [{ email }, { employeeId }]
    });

    if (existingWorker) {
      return res.status(400).json({
        success: false,
        message: existingWorker.email === email 
          ? 'Email already registered'
          : 'Employee ID already exists'
      });
    }

    // Create new worker
    const worker = new Worker({
      name,
      email,
      password,
      phone,
      employeeId: employeeId.toUpperCase(),
      department: department || 'Sales'
    });

    await worker.save();

    // Remove password from response
    const workerResponse = worker.toObject();
    delete workerResponse.password;

    res.status(201).json({
      success: true,
      message: 'Worker created successfully',
      worker: workerResponse
    });

  } catch (error) {
    console.error('Create worker error:', error);
    res.status(500).json({ success: false, message: 'Failed to create worker' });
  }
};

// Update Worker
exports.updateWorker = async (req, res) => {
  try {
    const { workerId } = req.params;
    const updates = req.body;

    // Don't allow updating certain fields
    delete updates._id;
    delete updates.password; // Password updates should have separate endpoint
    delete updates.role;
    delete updates.createdAt;
    delete updates.updatedAt;

    const worker = await Worker.findByIdAndUpdate(
      workerId,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    res.json({
      success: true,
      message: 'Worker updated successfully',
      worker
    });

  } catch (error) {
    console.error('Update worker error:', error);
    res.status(500).json({ success: false, message: 'Failed to update worker' });
  }
};

// Delete Worker
exports.deleteWorker = async (req, res) => {
  try {
    const { workerId } = req.params;

    // Soft delete - mark as inactive
    const worker = await Worker.findByIdAndUpdate(
      workerId,
      { isActive: false },
      { new: true }
    ).select('-password');

    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    res.json({
      success: true,
      message: 'Worker deactivated successfully',
      worker
    });

  } catch (error) {
    console.error('Delete worker error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete worker' });
  }
};

// Toggle Worker Status
exports.toggleWorkerStatus = async (req, res) => {
  try {
    const { workerId } = req.params;

    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    worker.isActive = !worker.isActive;
    await worker.save();

    const workerResponse = worker.toObject();
    delete workerResponse.password;

    res.json({
      success: true,
      message: `Worker ${worker.isActive ? 'activated' : 'deactivated'} successfully`,
      worker: workerResponse
    });

  } catch (error) {
    console.error('Toggle worker status error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle worker status' });
  }
};

// ===== ANALYTICS CONTROLLERS =====

// Get Revenue Analytics
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Daily revenue breakdown
    const dailyRevenue = await Bill.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: 'Completed'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          bills: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Payment method breakdown
    const paymentMethodBreakdown = await Bill.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: 'Completed'
        }
      },
      {
        $group: {
          _id: '$paymentMethod',
          revenue: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Top workers by revenue
    const topWorkers = await Bill.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: 'Completed'
        }
      },
      {
        $group: {
          _id: '$worker',
          revenue: { $sum: '$totalAmount' },
          bills: { $sum: 1 }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'workers',
          localField: '_id',
          foreignField: '_id',
          as: 'worker'
        }
      },
      { $unwind: '$worker' },
      {
        $project: {
          name: '$worker.name',
          employeeId: '$worker.employeeId',
          revenue: 1,
          bills: 1
        }
      }
    ]);

    // Total stats
    const totalStats = await Bill.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: 'Completed'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalBills: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' }
        }
      }
    ]);

    res.json({
      success: true,
      dailyRevenue,
      paymentMethodBreakdown,
      topWorkers,
      totalStats: totalStats[0] || { totalRevenue: 0, totalBills: 0, avgOrderValue: 0 }
    });

  } catch (error) {
    console.error('Get revenue analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch revenue analytics' });
  }
};

// Get Top Selling Medicines
exports.getTopSellingMedicines = async (req, res) => {
  try {
    const { period = 'month', limit = 10 } = req.query;
    const { startDate, endDate } = getDateRange(period);

    const topMedicines = await Bill.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'Completed'
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.tablet',
          name: { $first: '$items.name' },
          brand: { $first: '$items.brand' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.totalPrice' },
          avgPrice: { $avg: '$items.unitPrice' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'tablets',
          localField: '_id',
          foreignField: '_id',
          as: 'medicineInfo'
        }
      },
      { $unwind: { path: '$medicineInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: 1,
          brand: 1,
          company: '$medicineInfo.company',
          category: '$medicineInfo.category',
          currentStock: '$medicineInfo.stock',
          totalQuantity: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          avgPrice: { $round: ['$avgPrice', 2] }
        }
      }
    ]);

    res.json(topMedicines);

  } catch (error) {
    console.error('Get top selling medicines error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch top selling medicines' });
  }
};

// Get Demand Patterns
exports.getDemandPatterns = async (req, res) => {
  try {
    const { medicineId } = req.params;

    // Get sales data for the last 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const dailySales = await Bill.aggregate([
      {
        $match: {
          createdAt: { $gte: ninetyDaysAgo },
          status: 'Completed'
        }
      },
      { $unwind: '$items' },
      {
        $match: {
          'items.tablet': mongoose.Types.ObjectId(medicineId)
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.totalPrice' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate statistics
    const quantities = dailySales.map(d => d.quantity);
    const avgDailySales = quantities.length > 0
      ? quantities.reduce((a, b) => a + b, 0) / quantities.length
      : 0;

    const maxDailySales = quantities.length > 0 ? Math.max(...quantities) : 0;
    const minDailySales = quantities.length > 0 ? Math.min(...quantities) : 0;

    // Detect patterns
    const recentSales = quantities.slice(-7).reduce((a, b) => a + b, 0);
    const previousSales = quantities.slice(-14, -7).reduce((a, b) => a + b, 0);
    
    const trend = previousSales > 0
      ? ((recentSales - previousSales) / previousSales * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      dailySales,
      statistics: {
        avgDailySales: avgDailySales.toFixed(2),
        maxDailySales,
        minDailySales,
        trend: parseFloat(trend),
        trendDirection: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable'
      }
    });

  } catch (error) {
    console.error('Get demand patterns error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch demand patterns' });
  }
};

// ===== NOTIFICATIONS & SETTINGS =====

// Get Notifications
exports.getNotifications = async (req, res) => {
  try {
    // For now, return mock data
    // In production, you'd have a Notification model
    res.json([
      {
        _id: '1',
        type: 'stock_alert',
        message: 'Paracetamol is running low on stock',
        read: false,
        createdAt: new Date()
      }
    ]);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

// Mark Notification as Read
exports.markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    // Implementation would update notification status
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
};

// Mark All Notifications as Read
exports.markAllNotificationsRead = async (req, res) => {
  try {
    // Implementation would update all notifications
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
  }
};

// Get Settings
exports.getSettings = async (req, res) => {
  try {
    // Return default settings
    res.json({
      success: true,
      settings: {
        lowStockThreshold: 10,
        criticalStockThreshold: 5,
        autoReorderEnabled: false,
        emailNotifications: true,
        smsNotifications: false
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
};

// Update Settings
exports.updateSettings = async (req, res) => {
  try {
    const settings = req.body;
    // Implementation would save settings
    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};

// Get Dashboard Config
exports.getDashboardConfig = async (req, res) => {
  try {
    res.json({
      success: true,
      config: {
        defaultPeriod: 'today',
        showWorkerPerformance: true,
        showStockAlerts: true,
        showSalesTrends: true
      }
    });
  } catch (error) {
    console.error('Get dashboard config error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard config' });
  }
};

// Update Dashboard Config
exports.updateDashboardConfig = async (req, res) => {
  try {
    const config = req.body;
    res.json({
      success: true,
      message: 'Dashboard config updated successfully',
      config
    });
  } catch (error) {
    console.error('Update dashboard config error:', error);
    res.status(500).json({ success: false, message: 'Failed to update dashboard config' });
  }
};

// Generate Reports (placeholder - would use PDF generation library)
exports.generateSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    // Implementation would generate PDF report
    res.json({
      success: true,
      message: 'Report generation initiated',
      downloadUrl: '/reports/sales-report.pdf'
    });
  } catch (error) {
    console.error('Generate sales report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate sales report' });
  }
};

exports.generateInventoryReport = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Report generation initiated',
      downloadUrl: '/reports/inventory-report.pdf'
    });
  } catch (error) {
    console.error('Generate inventory report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate inventory report' });
  }
};

exports.generateWorkerReport = async (req, res) => {
  try {
    const { workerId } = req.params;
    res.json({
      success: true,
      message: 'Report generation initiated',
      downloadUrl: `/reports/worker-${workerId}-report.pdf`
    });
  } catch (error) {
    console.error('Generate worker report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate worker report' });
  }
};
// ===== STOCK REQUEST CONTROLLERS =====

// Get Stock Requests
exports.getStockRequests = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 15, 
      status, 
      urgency, 
      search 
    } = req.query;

    // Build query
    const query = {};

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by urgency
    if (urgency) {
      query.urgencyLevel = urgency;
    }

    // Search by request number
    if (search) {
      query.requestNumber = { $regex: search, $options: 'i' };
    }

    // Fetch requests with populated fields
    const requests = await StockRequest.find(query)
      .populate('tablet', 'name brand company strength price')
      .populate('requestedBy', 'name employeeId department')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Get total count for pagination
    const totalRequests = await StockRequest.countDocuments(query);

    res.json({
      success: true,
      requests,
      totalPages: Math.ceil(totalRequests / limit),
      currentPage: parseInt(page),
      totalRequests
    });

  } catch (error) {
    console.error('Get stock requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch stock requests',
      error: error.message 
    });
  }
};

// Get Stock Request Stats
exports.getStockRequestStats = async (req, res) => {
  try {
    // Get counts for each status
    const [
      pending,
      approved,
      rejected,
      critical
    ] = await Promise.all([
      StockRequest.countDocuments({ status: 'Pending' }),
      StockRequest.countDocuments({ status: 'Approved' }),
      StockRequest.countDocuments({ status: 'Rejected' }),
      StockRequest.countDocuments({ 
        urgencyLevel: 'Critical', 
        status: { $in: ['Pending', 'Under Review'] } 
      })
    ]);

    // Additional stats
    const [
      underReview,
      ordered,
      received
    ] = await Promise.all([
      StockRequest.countDocuments({ status: 'Under Review' }),
      StockRequest.countDocuments({ status: 'Ordered' }),
      StockRequest.countDocuments({ status: 'Received' })
    ]);

    // Get total estimated cost of pending requests
    const pendingCostResult = await StockRequest.aggregate([
      { 
        $match: { 
          status: { $in: ['Pending', 'Under Review'] },
          estimatedCost: { $exists: true }
        } 
      },
      { 
        $group: { 
          _id: null, 
          totalEstimatedCost: { $sum: '$estimatedCost' } 
        } 
      }
    ]);

    const totalEstimatedCost = pendingCostResult[0]?.totalEstimatedCost || 0;

    res.json({
      success: true,
      pending,
      approved,
      rejected,
      critical,
      underReview,
      ordered,
      received,
      totalEstimatedCost: Math.round(totalEstimatedCost)
    });

  } catch (error) {
    console.error('Get stock request stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch stock request stats',
      error: error.message 
    });
  }
};

// Approve Stock Request
exports.approveStockRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    // Find the request
    const stockRequest = await StockRequest.findById(requestId)
      .populate('tablet', 'name brand stock')
      .populate('requestedBy', 'name employeeId');

    if (!stockRequest) {
      return res.status(404).json({ 
        success: false, 
        message: 'Stock request not found' 
      });
    }

    // Check if already processed
    if (stockRequest.status !== 'Pending' && stockRequest.status !== 'Under Review') {
      return res.status(400).json({ 
        success: false, 
        message: `Request is already ${stockRequest.status.toLowerCase()}` 
      });
    }

    // Update request status
    stockRequest.status = 'Approved';
    stockRequest.reviewedBy = req.user._id; // Assuming auth middleware adds user to req
    stockRequest.reviewedAt = new Date();
    // stockRequest.adminNotes = req.body.adminNotes || 'Request approved';

    await stockRequest.save();

    // Optional: Send notification to worker
    // You can implement notification logic here

    res.json({
      success: true,
      message: 'Stock request approved successfully',
      request: stockRequest
    });

  } catch (error) {
    console.error('Approve stock request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to approve stock request',
      error: error.message 
    });
  }
};

// Reject Stock Request
exports.rejectStockRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    // Validate rejection reason
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rejection reason is required' 
      });
    }

    // Find the request
    const stockRequest = await StockRequest.findById(requestId)
      .populate('tablet', 'name brand')
      .populate('requestedBy', 'name employeeId');

    if (!stockRequest) {
      return res.status(404).json({ 
        success: false, 
        message: 'Stock request not found' 
      });
    }

    // Check if already processed
    if (stockRequest.status !== 'Pending' && stockRequest.status !== 'Under Review') {
      return res.status(400).json({ 
        success: false, 
        message: `Request is already ${stockRequest.status.toLowerCase()}` 
      });
    }

    // Update request status
    stockRequest.status = 'Rejected';
    stockRequest.reviewedBy = req.user._id;
    stockRequest.reviewedAt = new Date();
    stockRequest.adminNotes = reason;

    await stockRequest.save();

    // Optional: Send notification to worker about rejection
    // You can implement notification logic here

    res.json({
      success: true,
      message: 'Stock request rejected',
      request: stockRequest
    });

  } catch (error) {
    console.error('Reject stock request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reject stock request',
      error: error.message 
    });
  }
};

// Send to Vendor
exports.sendToVendor = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { 
      vendorId, 
      orderDate, 
      expectedDeliveryDate, 
      notes 
    } = req.body;

    // Validate required fields
    if (!vendorId || !expectedDeliveryDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vendor ID and expected delivery date are required' 
      });
    }

    // Find the request
    const stockRequest = await StockRequest.findById(requestId)
      .populate('tablet', 'name brand company price stock');

    if (!stockRequest) {
      return res.status(404).json({ 
        success: false, 
        message: 'Stock request not found' 
      });
    }

    // Check if request is approved
    if (stockRequest.status !== 'Approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only approved requests can be sent to vendor' 
      });
    }

    // Calculate total cost if not already set
    const totalCost = stockRequest.estimatedCost || 
      (stockRequest.tablet.price * stockRequest.requestedQuantity);

    // Update order details
    stockRequest.orderDetails = {
      vendor: vendorId,
      orderDate: orderDate || new Date(),
      expectedDeliveryDate: new Date(expectedDeliveryDate),
      totalCost: totalCost,
      notes: notes || ''
    };

    stockRequest.status = 'Ordered';
    await stockRequest.save();

    // Optional: Create a Purchase Order record
    // Optional: Send email/notification to vendor
    // Optional: Update inventory tracking

    res.json({
      success: true,
      message: 'Order sent to vendor successfully',
      request: stockRequest
    });

  } catch (error) {
    console.error('Send to vendor error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send order to vendor',
      error: error.message 
    });
  }
};

// Additional helper method: Mark as Received
exports.markStockReceived = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { 
      receivedQuantity, 
      actualDeliveryDate, 
      invoiceNumber,
      actualCost 
    } = req.body;

    const stockRequest = await StockRequest.findById(requestId)
      .populate('tablet');

    if (!stockRequest) {
      return res.status(404).json({ 
        success: false, 
        message: 'Stock request not found' 
      });
    }

    if (stockRequest.status !== 'Ordered') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only ordered requests can be marked as received' 
      });
    }

    // Update order details
    stockRequest.orderDetails.actualDeliveryDate = actualDeliveryDate || new Date();
    stockRequest.orderDetails.receivedQuantity = receivedQuantity || stockRequest.requestedQuantity;
    stockRequest.orderDetails.invoiceNumber = invoiceNumber;
    
    if (actualCost) {
      stockRequest.orderDetails.totalCost = actualCost;
    }

    stockRequest.status = 'Received';
    await stockRequest.save();

    // Update medicine stock
    const medicine = await Tablet.findById(stockRequest.tablet._id);
    if (medicine) {
      medicine.stock += (receivedQuantity || stockRequest.requestedQuantity);
      await medicine.save();
    }

    res.json({
      success: true,
      message: 'Stock received and inventory updated',
      request: stockRequest
    });

  } catch (error) {
    console.error('Mark stock received error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark stock as received',
      error: error.message 
    });
  }
};

// Get Single Stock Request Details
exports.getStockRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;

    const stockRequest = await StockRequest.findById(requestId)
      .populate('tablet', 'name brand company strength price stock')
      .populate('requestedBy', 'name employeeId department email phone')
      .populate('reviewedBy', 'name')
      .populate('orderDetails.vendor', 'name email phone')
      .lean();

    if (!stockRequest) {
      return res.status(404).json({ 
        success: false, 
        message: 'Stock request not found' 
      });
    }

    res.json({
      success: true,
      request: stockRequest
    });

  } catch (error) {
    console.error('Get stock request by ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch stock request details',
      error: error.message 
    });
  }
};
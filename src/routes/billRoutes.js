// backend/src/routes/billRoutes.js
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Bill = require('../models/Bill');
const Tablet = require('../models/Tablet');
const Worker = require('../models/Worker');
const authMiddleware = require('../middleware/authMiddleware');


// // 🧾 GENERATE BILL
// router.post('/generate', authMiddleware, async (req, res) => {
//   try {
//     const { items, customer, paymentMethod = 'Cash', discount = 0, notes = '' } = req.body;
//     const workerId = req.user.id;

//     if (!items || items.length === 0) {
//       return res.status(400).json({ message: 'No items provided for billing' });
//     }

//     // Validate and prepare bill items
//     const billItems = [];
//     let subtotal = 0;

//     // for (const item of items) {
//     //   const tablet = await Tablet.findById(item._id || item.tabletId);
      
//     //   if (!tablet) {
//     //     return res.status(404).json({ 
//     //       message: `Medicine not found: ${item.name}` 
//     //     });
//     //   }

//     //   if (tablet.stock < item.quantity) {
//     //     return res.status(400).json({ 
//     //       message: `Insufficient stock for ${tablet.name}. Available: ${tablet.stock}` 
//     //     });
//     //   }

//     //   const itemTotal = tablet.price * item.quantity;
//     //   subtotal += itemTotal;

//     //   billItems.push({
//     //     tablet: tablet._id,
//     //     name: tablet.name,
//     //     brand: tablet.brand,
//     //     strength: tablet.strength,
//     //     quantity: item.quantity,
//     //     unitPrice: tablet.price,
//     //     totalPrice: itemTotal
//     //   });

//     //   // Update stock and popularity
//     //   tablet.stock -= item.quantity;
//     //   tablet.popularity += 1;
//     //   await tablet.save();
//     // }

//     for (const item of items) {
//   const tabletId = item._id || item.tabletId || item.id || item.tablet?._id;
//   const tablet = await Tablet.findById(tabletId);

//   if (!tablet) {
//     return res.status(404).json({ 
//       message: `Medicine not found: ${item.name || tabletId}` 
//     });
//   }

//   if (tablet.stock < item.quantity) {
//     return res.status(400).json({ 
//       message: `Insufficient stock for ${tablet.name}. Available: ${tablet.stock}` 
//     });
//   }

//   const itemTotal = tablet.price * item.quantity;
//   subtotal += itemTotal;

//   billItems.push({
//     tablet: tablet._id,
//     name: tablet.name,
//     brand: tablet.brand,
//     strength: tablet.strength,
//     quantity: item.quantity,
//     unitPrice: tablet.price,
//     totalPrice: itemTotal
//   });

//   tablet.stock -= item.quantity;
//   tablet.popularity += 1;
//   await tablet.save();
// }


//     // Calculate totals
//     const tax = subtotal * 0.05; // 5% tax (adjust as needed)
//     const totalAmount = subtotal + tax - discount;

//     // Create bill
//     const bill = new Bill({
//       worker: workerId,
//       customer: customer || {},
//       items: billItems,
//       subtotal,
//       tax,
//       discount,
//       totalAmount,
//       paymentMethod,
//       notes
//     });

//     await bill.save();

//     // Update worker stats
//     await Worker.findByIdAndUpdate(workerId, {
//       $inc: {
//         'salesStats.totalBills': 1,
//         'salesStats.totalRevenue': totalAmount
//       }
//     });

//     // Generate PDF
//     const pdfBuffer = await generateBillPDF(bill);

//     // Set headers for PDF download
//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader('Content-Disposition', `attachment; filename="bill-${bill.billNumber}.pdf"`);
//     res.setHeader('Content-Length', pdfBuffer.length);

//     res.send(pdfBuffer);

//   } catch (error) {
//     console.error('Bill generation error:', error);
//     res.status(500).json({ 
//       message: 'Failed to generate bill', 
//       error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
//     });
//   }
// });

// 🧾 GENERATE BILL
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    console.log('Bill generation request:', req.body); // Debug log
    
    const { items, customer, paymentMethod = 'Cash', discount = 0, notes = '' } = req.body;
    const workerId = req.user.id;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items provided for billing' });
    }

    // Validate and prepare bill items
    const billItems = [];
    let subtotal = 0;

    for (const item of items) {
      console.log('Processing item:', item); // Debug log
      
      // Handle different item structure formats
      let tabletId;
      if (item.tablet && item.tablet._id) {
        tabletId = item.tablet._id;
      } else if (item.tabletId) {
        tabletId = item.tabletId;
      } else if (item._id) {
        tabletId = item._id;
      } else if (item.id) {
        tabletId = item.id;
      } else {
        console.error('No tablet ID found in item:', item);
        return res.status(400).json({ 
          message: `Invalid item format: ${JSON.stringify(item)}` 
        });
      }

      const tablet = await Tablet.findById(tabletId);
      
      if (!tablet) {
        console.error('Tablet not found:', tabletId);
        return res.status(404).json({ 
          message: `Medicine not found: ${item.name || tabletId}` 
        });
      }

      const requestedQuantity = parseInt(item.quantity) || 1;

      if (tablet.stock < requestedQuantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${tablet.name}. Available: ${tablet.stock}, Requested: ${requestedQuantity}` 
        });
      }

      const itemTotal = tablet.price * requestedQuantity;
      subtotal += itemTotal;

      billItems.push({
        tablet: tablet._id,
        name: tablet.name,
        brand: tablet.brand,
        company: tablet.company,
        strength: tablet.strength,
        quantity: requestedQuantity,
        unitPrice: tablet.price,
        totalPrice: itemTotal
      });

      // Update stock and popularity
      tablet.stock -= requestedQuantity;
      tablet.popularity = (tablet.popularity || 0) + 1;
      await tablet.save();
    }

    // Calculate totals
    const discountAmount = parseFloat(discount) || 0;
    const tax = subtotal * 0.05; // 5% tax
    const totalAmount = subtotal + tax - discountAmount;

    // Generate bill number
    const billCount = await Bill.countDocuments() + 1;
    const billNumber = `BILL-${Date.now()}-${billCount.toString().padStart(4, '0')}`;

    // Create bill
    const billData = {
      billNumber,
      worker: workerId,
      customer: customer || {},
      items: billItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      discount: discountAmount,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      paymentMethod,
      notes,
      status: 'Completed'
    };

    console.log('Creating bill with data:', billData); // Debug log

    const bill = new Bill(billData);
    await bill.save();

    // Update worker stats if Worker model has salesStats
    try {
      await Worker.findByIdAndUpdate(workerId, {
        $inc: {
          'salesStats.totalBills': 1,
          'salesStats.totalRevenue': totalAmount
        }
      });
    } catch (workerUpdateError) {
      console.warn('Worker stats update failed:', workerUpdateError.message);
      // Don't fail the whole operation for this
    }

    // Populate the bill for response
    const populatedBill = await Bill.findById(bill._id)
      .populate('worker', 'name employeeId')
      .populate('items.tablet', 'name brand company strength');

    console.log('Bill created successfully:', bill.billNumber); // Debug log

    // Return JSON response instead of PDF buffer
    res.status(201).json({
      success: true,
      message: 'Bill generated successfully',
      bill: populatedBill,
      downloadUrl: `/api/bills/${bill._id}/download`
    });

  } catch (error) {
    console.error('Bill generation error:', error);
    res.status(500).json({ 
      message: 'Failed to generate bill', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 📋 GET BILL HISTORY
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;
    const workerId = req.user.id;
    const userRole = req.user.role;

    const pageLimit = Math.min(parseInt(limit), 100);
    const skip = (parseInt(page) - 1) * pageLimit;

    // Build query
    const query = {};
    
    // If worker, only show their bills. If owner, show all bills
    if (userRole === 'worker') {
      query.worker = workerId;
    }

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const bills = await Bill.find(query)
      .populate('worker', 'name employeeId')
      .populate('items.tablet', 'name brand company')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean();

    const totalCount = await Bill.countDocuments(query);

    res.json({
      bills,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / pageLimit),
      hasMore: skip + bills.length < totalCount
    });

  } catch (error) {
    console.error('Bill history error:', error);
    res.status(500).json({ message: 'Failed to fetch bill history' });
  }
});

// 📄 GET SINGLE BILL
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const billId = req.params.id;
    const workerId = req.user.id;
    const userRole = req.user.role;

    const query = { _id: billId };
    
    // Workers can only access their own bills
    if (userRole === 'worker') {
      query.worker = workerId;
    }

    const bill = await Bill.findOne(query)
      .populate('worker', 'name employeeId phone')
      .populate('items.tablet', 'name brand company strength category')
      .lean();

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    res.json(bill);

  } catch (error) {
    console.error('Get bill error:', error);
    res.status(500).json({ message: 'Failed to fetch bill details' });
  }
});

// 🔄 UPDATE BILL STATUS
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const billId = req.params.id;
    const userRole = req.user.role;

    // Only owners can update bill status
    if (userRole !== 'owner') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const validStatuses = ['Draft', 'Completed', 'Cancelled', 'Refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const bill = await Bill.findByIdAndUpdate(
      billId,
      { status },
      { new: true }
    ).populate('worker', 'name employeeId');

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    res.json({
      success: true,
      message: 'Bill status updated successfully',
      bill
    });

  } catch (error) {
    console.error('Update bill status error:', error);
    res.status(500).json({ message: 'Failed to update bill status' });
  }
});

// 📊 BILL ANALYTICS
router.get('/analytics/summary', authMiddleware, async (req, res) => {
  try {
    const userRole = req.user.role;
    const workerId = req.user.id;
    
    // Only owners can access full analytics
    if (userRole !== 'owner') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { startDate, endDate } = req.query;
    const dateFilter = {};
    
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const analytics = await Bill.aggregate([
      { $match: { status: 'Completed', ...dateFilter } },
      {
        $group: {
          _id: null,
          totalBills: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          averageOrderValue: { $avg: '$totalAmount' },
          totalItemsSold: { $sum: { $sum: '$items.quantity' } }
        }
      }
    ]);

    // Top selling medicines
    const topMedicines = await Bill.aggregate([
      { $match: { status: 'Completed', ...dateFilter } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.tablet',
          name: { $first: '$items.name' },
          brand: { $first: '$items.brand' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.totalPrice' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      summary: analytics[0] || {
        totalBills: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
        totalItemsSold: 0
      },
      topMedicines
    });

  } catch (error) {
    console.error('Bill analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

// 🖨️ DOWNLOAD BILL PDF
router.get('/:id/download', authMiddleware, async (req, res) => {
  try {
    const billId = req.params.id;
    const workerId = req.user.id;
    const userRole = req.user.role;

    const query = { _id: billId };
    
    if (userRole === 'worker') {
      query.worker = workerId;
    }

    const bill = await Bill.findOne(query)
      .populate('worker', 'name employeeId phone')
      .populate('items.tablet', 'name brand company strength');

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const pdfBuffer = await generateBillPDF(bill);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bill-${bill.billNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);

  } catch (error) {
    console.error('Download bill error:', error);
    res.status(500).json({ message: 'Failed to download bill' });
  }
});

// 🗑️ DELETE BILL (Soft delete - mark as cancelled)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const billId = req.params.id;
    const userRole = req.user.role;

    // Only owners can delete bills
    if (userRole !== 'owner') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const bill = await Bill.findByIdAndUpdate(
      billId,
      { status: 'Cancelled' },
      { new: true }
    );

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    res.json({
      success: true,
      message: 'Bill cancelled successfully'
    });

  } catch (error) {
    console.error('Delete bill error:', error);
    res.status(500).json({ message: 'Failed to cancel bill' });
  }
});

// PDF Generation Function
async function generateBillPDF(bill) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .text('PHARMACARE', 50, 50);

      doc.fontSize(10)
         .font('Helvetica')
         .text('Complete Pharmacy Solution', 50, 75)
         .text('Phone: +91-9876543210', 50, 90)
         .text('Email: info@pharmacare.com', 50, 105);

      // Bill Info
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .text(`Bill #: ${bill.billNumber}`, 400, 50)
         .fontSize(10)
         .font('Helvetica')
         .text(`Date: ${new Date(bill.createdAt).toLocaleDateString()}`, 400, 90)
         .text(`Time: ${new Date(bill.createdAt).toLocaleTimeString()}`, 400, 105);

      // Worker Info
      if (bill.worker) {
        doc.text(`Served by: ${bill.worker.name}`, 400, 120)
           .text(`Employee ID: ${bill.worker.employeeId || 'N/A'}`, 400, 135);
      }

      // Customer Info (if provided)
      let yPos = 140;
      if (bill.customer && bill.customer.name) {
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .text('Customer Details:', 50, yPos);
        yPos += 20;
        
        doc.fontSize(10)
           .font('Helvetica')
           .text(`Name: ${bill.customer.name}`, 50, yPos);
        yPos += 15;
        
        if (bill.customer.phone) {
          doc.text(`Phone: ${bill.customer.phone}`, 50, yPos);
          yPos += 15;
        }
      }

      yPos += 20;

      // Items Table Header
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text('Item', 50, yPos)
         .text('Qty', 350, yPos)
         .text('Price', 400, yPos)
         .text('Total', 480, yPos);

      yPos += 20;
      
      // Draw line under header
      doc.moveTo(50, yPos)
         .lineTo(550, yPos)
         .stroke();

      yPos += 10;

      // Items
      doc.font('Helvetica');
      bill.items.forEach((item) => {
        doc.text(`${item.name} (${item.brand}) - ${item.strength}`, 50, yPos)
           .text(item.quantity.toString(), 350, yPos)
           .text(`₹${item.unitPrice}`, 400, yPos)
           .text(`₹${item.totalPrice}`, 480, yPos);
        yPos += 20;
      });

      yPos += 10;

      // Draw line before totals
      doc.moveTo(350, yPos)
         .lineTo(550, yPos)
         .stroke();

      yPos += 15;

      // Totals
      doc.text(`Subtotal:`, 400, yPos)
         .text(`₹${bill.subtotal.toFixed(2)}`, 480, yPos);
      yPos += 15;

      if (bill.tax > 0) {
        doc.text(`Tax:`, 400, yPos)
           .text(`₹${bill.tax.toFixed(2)}`, 480, yPos);
        yPos += 15;
      }

      if (bill.discount > 0) {
        doc.text(`Discount:`, 400, yPos)
           .text(`-₹${bill.discount.toFixed(2)}`, 480, yPos);
        yPos += 15;
      }

      // Total Amount
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text(`Total Amount:`, 400, yPos)
         .text(`₹${bill.totalAmount.toFixed(2)}`, 480, yPos);

      yPos += 30;

      // Payment Method
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Payment Method: ${bill.paymentMethod}`, 50, yPos);

      // Notes
      if (bill.notes) {
        yPos += 20;
        doc.text(`Notes: ${bill.notes}`, 50, yPos);
      }

      // Footer
      yPos = 750; // Near bottom of page
      doc.fontSize(8)
         .text('Thank you for your business!', 50, yPos, { align: 'center', width: 500 })
         .text('Generated by PharmaCare System', 50, yPos + 15, { align: 'center', width: 500 });

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = router;
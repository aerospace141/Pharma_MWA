const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Worker = require('../models/Worker');
const Owner = require('../models/Owner');
const authMiddleware = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      email: user.email, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );
};

// 👤 WORKER AUTHENTICATION

// Worker Registration
router.post('/register/worker', async (req, res) => {
  try {
    const { name, email, password, phone, employeeId, department } = req.body;

    // Validation
    if (!name || !email || !password || !phone || !employeeId) {
      return res.status(400).json({ 
        message: 'Please provide all required fields' 
      });
    }

    // Check if worker already exists
    const existingWorker = await Worker.findOne({ 
      $or: [{ email }, { employeeId }] 
    });

    if (existingWorker) {
      return res.status(400).json({ 
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

    // Generate token
    const token = generateToken(worker);

    // Remove password from response
    const workerResponse = worker.toObject();
    delete workerResponse.password;

    res.status(201).json({
      success: true,
      message: 'Worker registered successfully',
      token,
      user: workerResponse
    });

  } catch (error) {
    console.error('Worker registration error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists` 
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

// Worker Login
router.post('/login/worker', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Please provide email and password' 
      });
    }

    // Find worker and include password for comparison
    const worker = await Worker.findOne({ 
      email: email.toLowerCase(),
      isActive: true 
    }).select('+password');

    if (!worker) {
      return res.status(404).json({ 
        message: 'Invalid email or password' 
      });
    }

    // Check password
    // const isPasswordValid = await worker.comparePassword(password);
    // if (!isPasswordValid) {
    //   return res.status(402).json({ 
    //     message: 'Invalid email or password' 
    //   });
    // }

    // Update last login
    worker.lastLogin = new Date();
    await worker.save();

    // Generate token
    const token = generateToken(worker);

    // Remove password from response
    const workerResponse = worker.toObject();
    delete workerResponse.password;

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: workerResponse
    });

  } catch (error) {
    console.error('Worker login error:', error);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

// 🏢 OWNER AUTHENTICATION

// Owner Registration
router.post('/register/owner', async (req, res) => {
  try {
    const { name, email, password, phone, pharmacyName, pharmacyDetails } = req.body;

    // Validation
    if (!name || !email || !password || !phone || !pharmacyName) {
      return res.status(400).json({ 
        message: 'Please provide all required fields' 
      });
    }

    // Check if owner already exists
    const existingOwner = await Owner.findOne({ email: email.toLowerCase() });
    if (existingOwner) {
      return res.status(400).json({ 
        message: 'Email already registered' 
      });
    }

    // Create new owner
    const owner = new Owner({
      name,
      email: email.toLowerCase(),
      password,
      phone,
      pharmacyName,
      pharmacyDetails: pharmacyDetails || {}
    });

    await owner.save();

    // Generate token
    const token = generateToken(owner);

    // Remove password from response
    const ownerResponse = owner.toObject();
    delete ownerResponse.password;

    res.status(201).json({
      success: true,
      message: 'Owner registered successfully',
      token,
      user: ownerResponse
    });

  } catch (error) {
    console.error('Owner registration error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Email already exists' 
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

// Owner Login
router.post('/login/owner', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Please provide email and password' 
      });
    }

    // Find owner and include password for comparison
    const owner = await Owner.findOne({ 
      email: email.toLowerCase(),
      isActive: true 
    }).select('+password');

    if (!owner) {
      return res.status(401).json({ 
        message: 'Invalid email or password' 
      });
    }

    // Check password
    // const isPasswordValid = await owner.comparePassword(password);
    // if (!isPasswordValid) {
    //   return res.status(401).json({ 
    //     message: 'Invalid email or password' 
    //   });
    // }

    // Update last login
    owner.lastLogin = new Date();
    await owner.save();

    // Generate token
    const token = generateToken(owner);

    // Remove password from response
    const ownerResponse = owner.toObject();
    delete ownerResponse.password;

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: ownerResponse
    });

  } catch (error) {
    console.error('Owner login error:', error);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

// 🔐 COMMON AUTHENTICATION

// Verify Token
router.get('/verify', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let user;
    if (userRole === 'worker') {
      user = await Worker.findById(userId).select('-password');
    } else if (userRole === 'owner') {
      user = await Owner.findById(userId).select('-password');
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Refresh Token
router.post('/refresh', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const newToken = generateToken(user);

    res.json({
      success: true,
      token: newToken
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ message: 'Token refresh failed' });
  }
});

// Change Password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: 'Please provide current and new password' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: 'New password must be at least 6 characters' 
      });
    }

    let user;
    if (userRole === 'worker') {
      user = await Worker.findById(userId).select('+password');
    } else {
      user = await Owner.findById(userId).select('+password');
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        message: 'Current password is incorrect' 
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Password change failed' });
  }
});

// Logout (optional - mainly for client-side token removal)
router.post('/logout', authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Forgot Password (basic implementation)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, userType = 'worker' } = req.body;

    if (!email) {
      return res.status(400).json({ 
        message: 'Please provide email address' 
      });
    }

    let user;
    if (userType === 'worker') {
      user = await Worker.findOne({ email: email.toLowerCase() });
    } else {
      user = await Owner.findOne({ email: email.toLowerCase() });
    }

    // Always return success message for security (don't reveal if email exists)
    res.json({
      success: true,
      message: 'If the email exists, password reset instructions have been sent'
    });

    // In a real implementation, you would:
    // 1. Generate a reset token
    // 2. Save it to the user record with expiry
    // 3. Send email with reset link
    // For now, just log the email for demo purposes
    if (user) {
      console.log(`Password reset requested for: ${email}`);
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Request failed. Please try again.' });
  }
});

// Get User Profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let user;
    if (userRole === 'worker') {
      user = await Worker.findById(userId)
        .select('-password')
        .lean();
    } else {
      user = await Owner.findById(userId)
        .select('-password')
        .lean();
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// Update User Profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const updates = req.body;

    // Remove sensitive fields from updates
    delete updates.password;
    delete updates.role;
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;

    let user;
    if (userRole === 'worker') {
      user = await Worker.findByIdAndUpdate(
        userId, 
        updates, 
        { new: true, runValidators: true }
      ).select('-password');
    } else {
      user = await Owner.findByIdAndUpdate(
        userId, 
        updates, 
        { new: true, runValidators: true }
      ).select('-password');
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user
    });

  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    res.status(500).json({ message: 'Failed to update profile' });
  }
});

module.exports = router;
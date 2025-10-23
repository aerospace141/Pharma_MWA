const jwt = require('jsonwebtoken');
const Worker = require('../models/Worker');
const Owner = require('../models/Owner');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Access denied. No valid token provided.' 
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user still exists and is active
    let user;
    if (decoded.role === 'worker') {
      user = await Worker.findById(decoded.id).select('-password');
    } else if (decoded.role === 'owner') {
      user = await Owner.findById(decoded.id).select('-password');
    }

    if (!user || !user.isActive) {
      return res.status(402).json({ 
        message: 'Access denied. User not found or inactive.' 
      });
    }

    // Add user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: user.name
    };

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Access denied. Invalid token.' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Access denied. Token expired.' 
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      message: 'Internal server error.' 
    });
  }
};

// Role-based access control middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required.' 
      });
    }

    const userRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!userRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Access denied. Insufficient permissions.' 
      });
    }

    next();
  };
};

// Owner only middleware
const requireOwner = requireRole('owner');

// Worker only middleware  
const requireWorker = requireRole('worker');

// Either owner or worker middleware
const requireAuth = requireRole(['owner', 'worker']);

module.exports = {
  authMiddleware,
  requireRole,
  requireOwner,
  requireWorker,
  requireAuth
};

// For backward compatibility
module.exports.default = authMiddleware;
module.exports = authMiddleware;
const { body, param, query, validationResult } = require('express-validator');

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Common validation rules
const validateEmail = body('email')
  .isEmail()
  .normalizeEmail()
  .withMessage('Please provide a valid email address');

const validatePassword = body('password')
  .isLength({ min: 6 })
  .withMessage('Password must be at least 6 characters long')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number');

const validatePhone = body('phone')
  .matches(/^[6-9]\d{9}$/)
  .withMessage('Please provide a valid Indian phone number');

const validateObjectId = param('id')
  .isMongoId()
  .withMessage('Invalid ID format');

// Worker registration validation
const validateWorkerRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  validateEmail,
  validatePassword,
  validatePhone,
  body('employeeId')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Employee ID must be between 3 and 20 characters')
    .matches(/^[A-Z0-9]+$/)
    .withMessage('Employee ID must contain only uppercase letters and numbers'),
  body('department')
    .optional()
    .isIn(['Sales', 'Inventory', 'Billing', 'General'])
    .withMessage('Invalid department'),
  handleValidationErrors
];

// Login validation
const validateLogin = [
  validateEmail,
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Search validation
const validateSearch = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  handleValidationErrors
];

// Bill validation
const validateBillGeneration = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  body('items.*.tabletId')
    .optional()
    .isMongoId()
    .withMessage('Invalid tablet ID'),
  body('items.*._id')
    .optional()
    .isMongoId()
    .withMessage('Invalid tablet ID'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('customer.name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Customer name must be between 2 and 50 characters'),
  body('customer.phone')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please provide a valid phone number'),
  body('paymentMethod')
    .optional()
    .isIn(['Cash', 'Card', 'UPI', 'Net Banking'])
    .withMessage('Invalid payment method'),
  body('discount')
    .optional()
    .isNumeric({ min: 0 })
    .withMessage('Discount must be a non-negative number'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateWorkerRegistration,
  validateLogin,
  validateSearch,
  validateBillGeneration,
  validateObjectId,
  validateEmail,
  validatePassword,
  validatePhone
};
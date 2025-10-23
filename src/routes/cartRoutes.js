// backend/src/routes/cartRoutes.js
const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Tablet = require('../models/Tablet');
const authMiddleware = require('../middleware/authMiddleware');
const { validateObjectId } = require('../middleware/validation');

// 🛒 GET USER CART
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    let cart = await Cart.findOne({ user: userId })
      .populate({
        path: 'items.tablet',
        select: 'name brand company strength price stock category description isActive'
      })
      .lean();

    if (!cart) {
      cart = {
        user: userId,
        items: [],
        totalItems: 0,
        totalAmount: 0,
        updatedAt: new Date()
      };
    } else {
      // Filter out inactive medicines and update availability
      cart.items = cart.items.filter(item => {
        if (!item.tablet || !item.tablet.isActive || item.tablet.stock === 0) {
          return false;
        }
        // Update availability status
        item.tablet.available = item.tablet.stock >= item.quantity;
        item.tablet.maxAvailable = item.tablet.stock;
        return true;
      });

      // Recalculate totals after filtering
      cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
      cart.totalAmount = cart.items.reduce((total, item) => {
        return total + (item.tablet.price * item.quantity);
      }, 0);
    }

    res.json({
      success: true,
      cart
    });

  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch cart' 
    });
  }
});

// ➕ ADD ITEM TO CART
router.post('/add', authMiddleware, async (req, res) => {
  try {
    const { tabletId, quantity = 1 } = req.body;
    const userId = req.user.id;

    if (!tabletId) {
      return res.status(400).json({ 
        success: false,
        message: 'Tablet ID is required' 
      });
    }

    if (quantity < 1 || quantity > 100) {
      return res.status(400).json({ 
        success: false,
        message: 'Quantity must be between 1 and 100' 
      });
    }

    // Check if tablet exists and is available
    const tablet = await Tablet.findById(tabletId);
    if (!tablet) {
      return res.status(404).json({ 
        success: false,
        message: 'Medicine not found' 
      });
    }

    if (!tablet.isActive) {
      return res.status(400).json({ 
        success: false,
        message: 'Medicine is not available' 
      });
    }

    if (tablet.stock < quantity) {
      return res.status(400).json({ 
        success: false,
        message: `Insufficient stock. Only ${tablet.stock} items available` 
      });
    }

    // Find or create cart
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    // Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.tablet.toString() === tabletId
    );

    if (existingItemIndex > -1) {
      // Update existing item
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      
      if (newQuantity > tablet.stock) {
        return res.status(400).json({ 
          success: false,
          message: `Cannot add ${quantity} more items. Maximum available: ${tablet.stock - cart.items[existingItemIndex].quantity}` 
        });
      }

      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].updatedAt = new Date();
    } else {
      // Add new item
      cart.items.push({
        tablet: tabletId,
        quantity,
        priceAtTime: tablet.price, // Store price at time of adding
        addedAt: new Date()
      });
    }

    // Update cart totals
    await updateCartTotals(cart);
    
    await cart.save();

    // Return populated cart
    await cart.populate({
      path: 'items.tablet',
      select: 'name brand company strength price stock category'
    });

    res.json({
      success: true,
      message: 'Item added to cart successfully',
      cart
    });

  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to add item to cart' 
    });
  }
});

// 📝 UPDATE CART ITEM QUANTITY
router.put('/update/:itemId', authMiddleware, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const userId = req.user.id;

    if (!quantity || quantity < 1 || quantity > 100) {
      return res.status(400).json({ 
        success: false,
        message: 'Quantity must be between 1 and 100' 
      });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ 
        success: false,
        message: 'Cart not found' 
      });
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ 
        success: false,
        message: 'Item not found in cart' 
      });
    }

    // Check tablet availability
    const tablet = await Tablet.findById(cart.items[itemIndex].tablet);
    if (!tablet || !tablet.isActive) {
      return res.status(400).json({ 
        success: false,
        message: 'Medicine is no longer available' 
      });
    }

    if (tablet.stock < quantity) {
      return res.status(400).json({ 
        success: false,
        message: `Insufficient stock. Only ${tablet.stock} items available` 
      });
    }

    // Update quantity
    cart.items[itemIndex].quantity = quantity;
    cart.items[itemIndex].updatedAt = new Date();

    // Update totals
    await updateCartTotals(cart);
    
    await cart.save();

    // Return populated cart
    await cart.populate({
      path: 'items.tablet',
      select: 'name brand company strength price stock category'
    });

    res.json({
      success: true,
      message: 'Cart updated successfully',
      cart
    });

  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to update cart' 
    });
  }
});

// ❌ REMOVE ITEM FROM CART
router.delete('/remove/:itemId', authMiddleware, async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ 
        success: false,
        message: 'Cart not found' 
      });
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ 
        success: false,
        message: 'Item not found in cart' 
      });
    }

    // Remove item
    cart.items.splice(itemIndex, 1);

    // Update totals
    await updateCartTotals(cart);
    
    await cart.save();

    // Return populated cart
    await cart.populate({
      path: 'items.tablet',
      select: 'name brand company strength price stock category'
    });

    res.json({
      success: true,
      message: 'Item removed from cart successfully',
      cart
    });

  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to remove item from cart' 
    });
  }
});

// 🗑️ CLEAR ENTIRE CART
router.delete('/clear', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ 
        success: false,
        message: 'Cart not found' 
      });
    }

    cart.items = [];
    cart.totalItems = 0;
    cart.totalAmount = 0;
    
    await cart.save();

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      cart
    });

  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to clear cart' 
    });
  }
});

// 📊 GET CART SUMMARY
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOne({ user: userId });
    
    if (!cart || cart.items.length === 0) {
      return res.json({
        success: true,
        summary: {
          totalItems: 0,
          totalAmount: 0,
          uniqueItems: 0,
          isEmpty: true
        }
      });
    }

    // Get available tablets count
    const availableItems = await Promise.all(
      cart.items.map(async (item) => {
        const tablet = await Tablet.findById(item.tablet);
        return tablet && tablet.isActive && tablet.stock >= item.quantity;
      })
    );

    const availableCount = availableItems.filter(Boolean).length;

    const summary = {
      totalItems: cart.totalItems,
      totalAmount: cart.totalAmount,
      uniqueItems: cart.items.length,
      availableItems: availableCount,
      unavailableItems: cart.items.length - availableCount,
      isEmpty: cart.items.length === 0,
      lastUpdated: cart.updatedAt
    };

    res.json({
      success: true,
      summary
    });

  } catch (error) {
    console.error('Get cart summary error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch cart summary' 
    });
  }
});

// 🔄 SYNC CART (Update prices and availability)
router.post('/sync', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOne({ user: userId });
    if (!cart || cart.items.length === 0) {
      return res.json({
        success: true,
        message: 'Cart is empty',
        cart: { items: [], totalItems: 0, totalAmount: 0 }
      });
    }

    let hasChanges = false;
    const unavailableItems = [];

    // Check each item for availability and price changes
    for (let i = cart.items.length - 1; i >= 0; i--) {
      const item = cart.items[i];
      const tablet = await Tablet.findById(item.tablet);

      if (!tablet || !tablet.isActive || tablet.stock === 0) {
        // Remove unavailable items
        unavailableItems.push({
          name: item.name || 'Unknown medicine',
          reason: 'No longer available'
        });
        cart.items.splice(i, 1);
        hasChanges = true;
      } else if (tablet.stock < item.quantity) {
        // Adjust quantity if insufficient stock
        unavailableItems.push({
          name: tablet.name,
          reason: `Quantity reduced from ${item.quantity} to ${tablet.stock} (insufficient stock)`
        });
        item.quantity = tablet.stock;
        hasChanges = true;
      } else if (tablet.price !== item.priceAtTime) {
        // Update price if changed
        item.priceAtTime = tablet.price;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await updateCartTotals(cart);
      await cart.save();
    }

    // Return populated cart
    await cart.populate({
      path: 'items.tablet',
      select: 'name brand company strength price stock category'
    });

    res.json({
      success: true,
      message: hasChanges ? 'Cart has been updated' : 'Cart is up to date',
      cart,
      changes: {
        hasChanges,
        unavailableItems
      }
    });

  } catch (error) {
    console.error('Sync cart error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to sync cart' 
    });
  }
});

// 💾 SAVE CART FOR LATER (Convert to saved items)
router.post('/save-for-later', authMiddleware, async (req, res) => {
  try {
    const { itemId } = req.body;
    const userId = req.user.id;

    if (!itemId) {
      return res.status(400).json({ 
        success: false,
        message: 'Item ID is required' 
      });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ 
        success: false,
        message: 'Cart not found' 
      });
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ 
        success: false,
        message: 'Item not found in cart' 
      });
    }

    // Move item to saved items
    const savedItem = cart.items[itemIndex];
    savedItem.savedForLater = true;
    savedItem.savedAt = new Date();

    // Initialize savedItems array if it doesn't exist
    if (!cart.savedItems) {
      cart.savedItems = [];
    }

    cart.savedItems.push(savedItem);
    cart.items.splice(itemIndex, 1);

    // Update totals
    await updateCartTotals(cart);
    
    await cart.save();

    res.json({
      success: true,
      message: 'Item saved for later',
      cart
    });

  } catch (error) {
    console.error('Save for later error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to save item for later' 
    });
  }
});

// 🛒 MOVE SAVED ITEM BACK TO CART
router.post('/move-to-cart', authMiddleware, async (req, res) => {
  try {
    const { savedItemId } = req.body;
    const userId = req.user.id;

    if (!savedItemId) {
      return res.status(400).json({ 
        success: false,
        message: 'Saved item ID is required' 
      });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart || !cart.savedItems) {
      return res.status(404).json({ 
        success: false,
        message: 'No saved items found' 
      });
    }

    const savedItemIndex = cart.savedItems.findIndex(
      item => item._id.toString() === savedItemId
    );
    
    if (savedItemIndex === -1) {
      return res.status(404).json({ 
        success: false,
        message: 'Saved item not found' 
      });
    }

    const savedItem = cart.savedItems[savedItemIndex];
    
    // Check if tablet is still available
    const tablet = await Tablet.findById(savedItem.tablet);
    if (!tablet || !tablet.isActive) {
      return res.status(400).json({ 
        success: false,
        message: 'Medicine is no longer available' 
      });
    }

    if (tablet.stock < savedItem.quantity) {
      return res.status(400).json({ 
        success: false,
        message: `Insufficient stock. Only ${tablet.stock} items available` 
      });
    }

    // Move back to cart
    delete savedItem.savedForLater;
    delete savedItem.savedAt;
    savedItem.updatedAt = new Date();

    cart.items.push(savedItem);
    cart.savedItems.splice(savedItemIndex, 1);

    // Update totals
    await updateCartTotals(cart);
    
    await cart.save();

    res.json({
      success: true,
      message: 'Item moved back to cart',
      cart
    });

  } catch (error) {
    console.error('Move to cart error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to move item to cart' 
    });
  }
});

// Helper function to update cart totals
async function updateCartTotals(cart) {
  let totalItems = 0;
  let totalAmount = 0;

  for (const item of cart.items) {
    totalItems += item.quantity;
    
    // Get current price from tablet
    const tablet = await Tablet.findById(item.tablet);
    if (tablet) {
      totalAmount += tablet.price * item.quantity;
      // Update stored price
      item.priceAtTime = tablet.price;
    }
  }

  cart.totalItems = totalItems;
  cart.totalAmount = totalAmount;
  cart.updatedAt = new Date();
}

module.exports = router;
// backend/src/routes/tabletRoutes.js
const express = require('express');
const router = express.Router();
const Tablet = require('../models/Tablet');
const authMiddleware = require('../middleware/authMiddleware');

// 🔍 FUZZY SEARCH - Main search endpoint
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q: query, limit = 10, page = 1 } = req.query;
    
    if (!query || query.trim().length < 1) {
      return res.json({
        results: [],
        totalResults: 0,
        page: parseInt(page),
        totalPages: 0
      });
    }

    const searchTerm = query.trim();
    const pageLimit = Math.min(parseInt(limit), 50); // Max 50 results
    const skip = (parseInt(page) - 1) * pageLimit;

    // Create fuzzy search query with multiple matching strategies
    const searchQueries = [
      // Exact match (highest priority)
      {
        $or: [
          { name: { $regex: `^${searchTerm}$`, $options: 'i' } },
          { brand: { $regex: `^${searchTerm}$`, $options: 'i' } }
        ],
        stock: { $gt: 0 }, // Only in-stock items
        weight: 100
      },
      // Starts with (high priority)
      {
        $or: [
          { name: { $regex: `^${searchTerm}`, $options: 'i' } },
          { brand: { $regex: `^${searchTerm}`, $options: 'i' } },
          { company: { $regex: `^${searchTerm}`, $options: 'i' } }
        ],
        stock: { $gt: 0 },
        weight: 80
      },
      // Contains (medium priority)
      {
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { brand: { $regex: searchTerm, $options: 'i' } },
          { company: { $regex: searchTerm, $options: 'i' } },
          { category: { $regex: searchTerm, $options: 'i' } },
          { searchTerms: { $in: [new RegExp(searchTerm, 'i')] } }
        ],
        stock: { $gt: 0 },
        weight: 60
      },
      // MongoDB text search (lower priority but good for typos)
      {
        $text: { $search: searchTerm },
        stock: { $gt: 0 },
        weight: 40
      }
    ];

    // Execute searches in parallel
    const searchPromises = searchQueries.map(async (query) => {
      const { weight, ...searchQuery } = query;
      const results = await Tablet.find(searchQuery)
        .select('name brand company strength price stock category description popularity')
        .lean();
      
      return results.map(result => ({
        ...result,
        searchWeight: weight + (result.popularity || 0) * 0.1 // Add popularity boost
      }));
    });

    const allResults = await Promise.all(searchPromises);
    
    // Flatten and deduplicate results
    const flatResults = allResults.flat();
    const uniqueResults = new Map();
    
    flatResults.forEach(item => {
      const key = item._id.toString();
      if (!uniqueResults.has(key) || uniqueResults.get(key).searchWeight < item.searchWeight) {
        uniqueResults.set(key, item);
      }
    });

    // Sort by search weight (relevance) and popularity
    const sortedResults = Array.from(uniqueResults.values())
      .sort((a, b) => {
        if (b.searchWeight !== a.searchWeight) {
          return b.searchWeight - a.searchWeight;
        }
        return (b.popularity || 0) - (a.popularity || 0);
      })
      .slice(skip, skip + pageLimit)
      .map(({ searchWeight, ...item }) => item); // Remove searchWeight from final results

    const totalResults = uniqueResults.size;
    const totalPages = Math.ceil(totalResults / pageLimit);

    // Log search analytics
    // await logSearchAnalytics(searchTerm, totalResults, req.user.id);
    const logSearchAnalytics = async (term, count, userId) => {
  console.log(`User ${userId} searched for "${term}" and found ${count} results`);
  return true;
};
// await Tablet.syncIndexes();



    res.json({
      results: sortedResults,
      totalResults,
      page: parseInt(page),
      totalPages,
      query: searchTerm
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      message: 'Search failed', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// 🚀 AUTOCOMPLETE - Fast suggestions endpoint
router.get('/suggestions', authMiddleware, async (req, res) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.json({ suggestions: [] });
    }

    const searchTerm = query.trim();
    
    // Get top 8 suggestions based on starts-with and popularity
    const suggestions = await Tablet.aggregate([
      {
        $match: {
          $and: [
            { stock: { $gt: 0 } },
            {
              $or: [
                { name: { $regex: `^${searchTerm}`, $options: 'i' } },
                { brand: { $regex: `^${searchTerm}`, $options: 'i' } },
                { searchTerms: { $elemMatch: { $regex: `^${searchTerm}`, $options: 'i' } } }
              ]
            }
          ]
        }
      },
      {
        $addFields: {
          relevanceScore: {
            $add: [
              { $ifNull: ['$popularity', 0] },
              {
                $cond: [
                  { $regexMatch: { input: '$name', regex: `^${searchTerm}`, options: 'i' } },
                  50,
                  0
                ]
              },
              {
                $cond: [
                  { $regexMatch: { input: '$brand', regex: `^${searchTerm}`, options: 'i' } },
                  30,
                  0
                ]
              }
            ]
          }
        }
      },
      { $sort: { relevanceScore: -1 } },
      { $limit: 8 },
      {
        $project: {
          _id: 1,
          name: 1,
          brand: 1,
          company: 1,
          strength: 1,
          price: 1,
          category: 1
        }
      }
    ]);

    res.json({ suggestions });

  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ suggestions: [] });
  }
});

// 📈 POPULAR MEDICINES - Preload data for offline capability
router.get('/popular', authMiddleware, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    const popularMedicines = await Tablet.find({ stock: { $gt: 0 } })
      .select('name brand company strength price category description popularity')
      .sort({ popularity: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ medicines: popularMedicines });

  } catch (error) {
    console.error('Popular medicines error:', error);
    res.status(500).json({ medicines: [] });
  }
});

// 📊 MEDICINE DETAILS - Get single medicine details
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const medicine = await Tablet.findById(req.params.id);
    
    if (!medicine) {
      return res.status(404).json({ message: 'Medicine not found' });
    }

    res.json(medicine);

  } catch (error) {
    console.error('Medicine details error:', error);
    res.status(500).json({ message: 'Failed to fetch medicine details' });
  }
});

// 🎯 CATEGORY SEARCH - Search by category
router.get('/category/:category', authMiddleware, async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 20, page = 1 } = req.query;
    
    const pageLimit = parseInt(limit);
    const skip = (parseInt(page) - 1) * pageLimit;

    const medicines = await Tablet.find({
      category: { $regex: category, $options: 'i' },
      stock: { $gt: 0 }
    })
    .select('name brand company strength price category description')
    .sort({ popularity: -1 })
    .skip(skip)
    .limit(pageLimit)
    .lean();

    const totalCount = await Tablet.countDocuments({
      category: { $regex: category, $options: 'i' },
      stock: { $gt: 0 }
    });

    res.json({
      medicines,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / pageLimit)
    });

  } catch (error) {
    console.error('Category search error:', error);
    res.status(500).json({ message: 'Failed to fetch medicines by category' });
  }
});

// 🔄 UPDATE POPULARITY - Increment when medicine is searched/viewed
router.post('/:id/view', authMiddleware, async (req, res) => {
  try {
    await Tablet.findByIdAndUpdate(
      req.params.id,
      { $inc: { popularity: 1 } },
      { new: true }
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Update popularity error:', error);
    res.status(500).json({ success: false });
  }
});

// 🔍 ADVANCED SEARCH - With filters
router.post('/advanced-search', authMiddleware, async (req, res) => {
  try {
    const {
      query = '',
      category,
      priceRange,
      company,
      inStock = true,
      sortBy = 'relevance',
      limit = 20,
      page = 1
    } = req.body;

    const pageLimit = parseInt(limit);
    const skip = (parseInt(page) - 1) * pageLimit;

    // Build search filter
    const searchFilter = { $and: [] };

    // Stock filter
    if (inStock) {
      searchFilter.$and.push({ stock: { $gt: 0 } });
    }

    // Text search
    if (query.trim()) {
      searchFilter.$and.push({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { brand: { $regex: query, $options: 'i' } },
          { company: { $regex: query, $options: 'i' } },
          { searchTerms: { $in: [new RegExp(query, 'i')] } }
        ]
      });
    }

    // Category filter
    if (category) {
      searchFilter.$and.push({ category: { $regex: category, $options: 'i' } });
    }

    // Company filter
    if (company) {
      searchFilter.$and.push({ company: { $regex: company, $options: 'i' } });
    }

    // Price range filter
    if (priceRange) {
      const priceFilter = {};
      if (priceRange.min !== undefined) priceFilter.$gte = priceRange.min;
      if (priceRange.max !== undefined) priceFilter.$lte = priceRange.max;
      searchFilter.$and.push({ price: priceFilter });
    }

    // Sort options
    const sortOptions = {
      relevance: { popularity: -1, name: 1 },
      price_low: { price: 1 },
      price_high: { price: -1 },
      name: { name: 1 },
      popularity: { popularity: -1 }
    };

    const medicines = await Tablet.find(searchFilter.$and.length ? searchFilter : {})
      .select('name brand company strength price stock category description popularity')
      .sort(sortOptions[sortBy] || sortOptions.relevance)
      .skip(skip)
      .limit(pageLimit)
      .lean();

    const totalCount = await Tablet.countDocuments(searchFilter.$and.length ? searchFilter : {});

    res.json({
      medicines,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / pageLimit),
      filters: { query, category, priceRange, company, inStock, sortBy }
    });

  } catch (error) {
    console.error('Advanced search error:', error);
    res.status(500).json({ message: 'Advanced search failed' });
  }
});

module.exports = router;
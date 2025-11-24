import express from 'express';
import User from '../models/User.js';
import { verifySignature } from '../utils/verifySignature.js';
import { generateToken } from '../utils/jwt.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/verify
// Verify wallet signature and create/return user
router.post('/verify', async (req, res) => {
  try {
    const { walletAddress, message, signature } = req.body;

    // Validate input
    if (!walletAddress || !message || !signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: walletAddress, message, signature',
      });
    }

    // Verify signature
    const isValid = verifySignature(message, signature, walletAddress);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid signature',
      });
    }

    // Check if user exists
    let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
    let isNewUser = false;

    if (user) {
      // Update existing user
      user.lastSignature = signature;
      user.lastSignedMessage = message;
      user.lastLoginAt = new Date();
      await user.save();
    } else {
      // Create new user
      user = new User({
        walletAddress: walletAddress.toLowerCase(),
        lastSignature: signature,
        lastSignedMessage: message,
      });
      await user.save();
      isNewUser = true;
    }

    // Generate JWT token
    const token = generateToken(user._id.toString(), user.walletAddress);

    return res.status(isNewUser ? 201 : 200).json({
      success: true,
      message: isNewUser ? 'User created successfully!' : 'Welcome back!',
      token,
      user: {
        walletAddress: user.walletAddress,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        isNewUser,
      },
    });
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// GET /api/auth/me
// Get current authenticated user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      user: {
        walletAddress: req.user.walletAddress,
        createdAt: req.user.createdAt,
        lastLoginAt: req.user.lastLoginAt,
        isActive: req.user.isActive,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// GET /api/auth/user/:walletAddress
// Get user by wallet address
router.get('/user/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;

    const user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        walletAddress: user.walletAddress,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

export default router;

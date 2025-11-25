import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Solana connection (devnet)
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// POST /api/transactions/verify
// Verify and store a transaction
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { txHash, tokenMint, recipient } = req.body;
    const userId = req.user._id;
    const walletAddress = req.user.walletAddress;

    // Validate input
    if (!txHash) {
      return res.status(400).json({
        success: false,
        message: 'Missing transaction hash',
      });
    }

    // Check if transaction already exists
    const existingTx = await Transaction.findOne({ txHash });
    if (existingTx) {
      return res.status(200).json({
        success: true,
        message: 'Transaction already recorded',
        transaction: existingTx,
      });
    }

    // Fetch transaction from blockchain
    let txInfo;
    try {
      txInfo = await connection.getTransaction(txHash, {
        maxSupportedTransactionVersion: 0,
      });
    } catch (error) {
      console.error('Error fetching transaction:', error);
      return res.status(400).json({
        success: false,
        message: 'Transaction not found on blockchain',
      });
    }

    if (!txInfo) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found on blockchain',
      });
    }

    // Parse transaction details
    const { meta, transaction: txData, slot, blockTime } = txInfo;
    
    // Check if transaction was successful
    if (meta?.err) {
      // Store failed transaction
      const failedTx = new Transaction({
        userId,
        walletAddress,
        txHash,
        type: tokenMint ? 'SPL_TOKEN' : 'SOL',
        tokenMint: tokenMint || null,
        amount: '0',
        sender: walletAddress,
        recipient: recipient || 'unknown',
        status: 'failed',
        blockTime: blockTime ? new Date(blockTime * 1000) : null,
        slot,
        fee: meta?.fee || 0,
        metadata: { error: meta.err },
      });

      await failedTx.save();

      return res.status(400).json({
        success: false,
        message: 'Transaction failed on blockchain',
        transaction: failedTx,
      });
    }

    // Determine transaction type and amount
    let type = 'SOL';
    let amount = '0';
    let actualRecipient = recipient || 'unknown';
    let tokenSymbol = null;

    // Parse pre and post balances for SOL transfers
    if (!tokenMint && meta?.preBalances && meta?.postBalances) {
      const accountKeys = txData.message.accountKeys || txData.message.staticAccountKeys;
      
      // Find the sender's balance change
      const senderIndex = accountKeys.findIndex(
        (key) => key.toBase58().toLowerCase() === walletAddress.toLowerCase()
      );

      if (senderIndex !== -1) {
        const preBalance = meta.preBalances[senderIndex];
        const postBalance = meta.postBalances[senderIndex];
        const balanceChange = Math.abs(preBalance - postBalance - (meta.fee || 0));
        amount = (balanceChange / 1e9).toString(); // Convert lamports to SOL
      }
    }

    // For SPL token transfers, parse from token balances
    if (tokenMint && meta?.preTokenBalances && meta?.postTokenBalances) {
      type = 'SPL_TOKEN';
      
      // Find token balance changes
      const postTokenBalance = meta.postTokenBalances.find(
        (tb) => tb.mint === tokenMint
      );

      const preTokenBalance = meta.preTokenBalances.find(
        (tb) => tb.mint === tokenMint && tb.accountIndex === postTokenBalance?.accountIndex
      );

      if (preTokenBalance && postTokenBalance) {
        const decimals = postTokenBalance.uiTokenAmount.decimals;
        const preAmount = preTokenBalance.uiTokenAmount.uiAmount || 0;
        const postAmount = postTokenBalance.uiTokenAmount.uiAmount || 0;
        amount = Math.abs(preAmount - postAmount).toString();
        tokenSymbol = postTokenBalance.uiTokenAmount.uiAmountString?.split(' ')[1] || null;
      }
    }

    // Create transaction record
    const newTransaction = new Transaction({
      userId,
      walletAddress,
      txHash,
      type,
      tokenMint: tokenMint || null,
      tokenSymbol,
      amount,
      sender: walletAddress,
      recipient: actualRecipient,
      status: 'confirmed',
      blockTime: blockTime ? new Date(blockTime * 1000) : null,
      slot,
      fee: meta?.fee || 0,
      metadata: {
        logMessages: meta?.logMessages?.slice(0, 5) || [],
      },
    });

    console.log('📝 Saving transaction to database...', {
      txHash: txHash.slice(0, 8) + '...',
      type,
      amount,
      status: 'confirmed'
    });

    await newTransaction.save();

    console.log('✅ Transaction saved successfully!', newTransaction._id);

    return res.status(201).json({
      success: true,
      message: 'Transaction verified and stored successfully',
      transaction: newTransaction,
    });
  } catch (error) {
    console.error('❌ Transaction verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// GET /api/transactions
// Get all transactions for the authenticated user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
    const userId = req.user._id;

    // Build query
    const query = { userId };
    
    if (status) {
      query.status = status;
    }
    
    if (type) {
      query.type = type;
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Transaction.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// GET /api/transactions/:txHash
// Get a specific transaction by hash
router.get('/:txHash', authMiddleware, async (req, res) => {
  try {
    const { txHash } = req.params;
    const userId = req.user._id;

    const transaction = await Transaction.findOne({
      txHash,
      userId,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    return res.status(200).json({
      success: true,
      transaction,
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// GET /api/transactions/stats/summary
// Get transaction statistics for the user
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    const [totalCount, confirmedCount, pendingCount, failedCount, totalVolume] = await Promise.all([
      Transaction.countDocuments({ userId }),
      Transaction.countDocuments({ userId, status: 'confirmed' }),
      Transaction.countDocuments({ userId, status: 'pending' }),
      Transaction.countDocuments({ userId, status: 'failed' }),
      Transaction.aggregate([
        { $match: { userId, status: 'confirmed', type: 'SOL' } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalTransactions: totalCount,
        confirmed: confirmedCount,
        pending: pendingCount,
        failed: failedCount,
        totalVolume: totalVolume[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

export default router;

import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  walletAddress: {
    type: String,
    required: true,
    lowercase: true,
  },
  txHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['SOL', 'SPL_TOKEN'],
    required: true,
  },
  tokenMint: {
    type: String,
    default: null,
  },
  tokenSymbol: {
    type: String,
    default: null,
  },
  amount: {
    type: String,
    required: true,
  },
  sender: {
    type: String,
    required: true,
  },
  recipient: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending',
  },
  blockTime: {
    type: Date,
    default: null,
  },
  slot: {
    type: Number,
    default: null,
  },
  fee: {
    type: Number,
    default: null,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for efficient queries
transactionSchema.index({ walletAddress: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

// Update timestamp on save
transactionSchema.pre('save', function () {
  this.updatedAt = new Date();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;

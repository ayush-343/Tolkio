import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  channelId: String, channelType: String, messageId: String, senderId: String,
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },
  attempts: { type: Number, default: 0 }, nextRunAt: { type: Date, default: Date.now },
  leaseOwner: String, leaseUntil: Date, error: String,
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 86400000), index: { expires: 0 } },
}, { timestamps: true });
schema.index({ status: 1, nextRunAt: 1, leaseUntil: 1 });
export const WebhookReceipt = mongoose.model('WebhookReceipt', schema);

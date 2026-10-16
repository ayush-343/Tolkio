import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true }, key: { type: String, required: true },
  requestHash: { type: String, required: true }, callId: { type: String, required: true },
  status: { type: String, default: 'provisioning' },
  leaseOwner: String, leaseUntil: Date,
  expiresAt: { type: Date, default: () => new Date(Date.now() + 86400000), index: { expires: 0 } },
}, { timestamps: true });
schema.index({ userId: 1, key: 1 }, { unique: true });
export const CommunicationOperation = mongoose.model('CommunicationOperation', schema);

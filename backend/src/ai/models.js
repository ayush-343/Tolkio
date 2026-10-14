import mongoose from 'mongoose';
const { Schema } = mongoose;
const jobSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  requestKey: String, requestHash: String, request: Schema.Types.Mixed,
  modelId: String, status: { type: String, default: 'queued' },
  result: Schema.Types.Mixed, error: String, startedAt: Date,
  expiresAt: { type: Date, default: () => new Date(Date.now() + 86400000), index: { expires: 0 } },
}, { timestamps: true });
jobSchema.index({ userId: 1, requestKey: 1 }, { unique: true });
jobSchema.index({ status: 1, createdAt: 1 });
export const AIJob = mongoose.model('AIJob', jobSchema);
const budgetSchema = new Schema({ _id: String, count: { type: Number, default: 0 }, expiresAt: { type: Date, index: { expires: 0 } } });
export const AIBudget = mongoose.model('AIBudget', budgetSchema);

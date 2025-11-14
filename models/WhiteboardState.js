const mongoose = require('mongoose');

const whiteboardStateSchema = new mongoose.Schema(
  {
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule', unique: true, required: true },
    roomId: { type: String, default: null },
    roomKey: { type: String, default: null },
    roomUrl: { type: String, default: null },
  },
  { timestamps: true, collection: 'whiteboard_states' }
);

module.exports = mongoose.model('WhiteboardState', whiteboardStateSchema);
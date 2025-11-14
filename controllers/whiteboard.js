const crypto = require('crypto');
const Schedule = require('../models/Schedule');
const WhiteboardState = require('../models/WhiteboardState');

// GET /api/whiteboard/room/:scheduleId
// Returns a static Excalidraw room link for this schedule (creates it on first call).
exports.getOrCreateRoom = async (req, res) => {
  const { scheduleId } = req.params;

  try {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found', code: 404 });

    const loc = String(schedule.location || '').toLowerCase();
    const isOnline = loc === 'online' || loc.includes('online');
    if (!isOnline) {
      return res.status(403).json({ message: 'Whiteboard available only for online sessions', code: 403 });
    }

    // If exists, return as-is
    let wb = await WhiteboardState.findOne({ scheduleId });
    if (wb?.roomId && wb?.roomKey && wb?.roomUrl) {
      return res.status(200).json({ roomId: wb.roomId, roomKey: wb.roomKey, roomUrl: wb.roomUrl, code: 200 });
    }

    // Create static roomId based on schedule, and random key (only once)
    const roomId = `sched-${String(scheduleId)}`;
    const roomKey = crypto.randomBytes(16).toString('base64url');
    const roomUrl = `https://excalidraw.com/#room=${encodeURIComponent(roomId)},${encodeURIComponent(roomKey)}`;

    wb = await WhiteboardState.findOneAndUpdate(
      { scheduleId },
      { scheduleId, roomId, roomKey, roomUrl },
      { upsert: true, new: true }
    );

    return res.status(200).json({ roomId: wb.roomId, roomKey: wb.roomKey, roomUrl: wb.roomUrl, code: 200 });
  } catch (err) {
    console.error('[whiteboard.getOrCreateRoom]', err);
    return res.status(500).json({ message: 'Failed to create whiteboard room', code: 500 });
  }
};

// Ensure a room exists for a given schedule
exports.ensureRoomForSchedule = async function ensureRoomForSchedule(scheduleId) {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) throw new Error('Schedule not found');

  const loc = String(schedule.location || '').toLowerCase();
  const isOnline = loc === 'online' || loc.includes('online');
  if (!isOnline) return null;

  let wb = await WhiteboardState.findOne({ scheduleId });
  if (wb?.roomId && wb?.roomKey && wb?.roomUrl) return wb;

  const roomId = `sched-${String(scheduleId)}`;
  const roomKey = crypto.randomBytes(16).toString('base64url');
  const roomUrl = `https://excalidraw.com/#room=${encodeURIComponent(roomId)},${encodeURIComponent(roomKey)}`;

  wb = await WhiteboardState.findOneAndUpdate(
    { scheduleId },
    { scheduleId, roomId, roomKey, roomUrl },
    { upsert: true, new: true }
  );
  return wb;
};
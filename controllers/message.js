const Message = require('../models/message');

exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user?.id || req.user?._id || req.body.sender; 
    const { receiver, text } = req.body;
    if (!senderId || !receiver || !text) return res.status(400).json({ message: 'Missing fields' });

    const msg = new Message({
      sender: senderId,
      receiver,
      text
    });
    const saved = await msg.save();

    const io = req.app.get('io');
    if (io) {
      io.to(String(receiver)).emit('message', saved);
    }

    res.status(201).json(saved);
  } catch (err) {
    console.error('sendMessage error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getConversation = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const withId = req.params.withId;
    if (!userId || !withId) return res.status(400).json({ message: 'Missing user ids' });

    const msgs = await Message.find({
      $or: [
        { sender: userId, receiver: withId },
        { sender: withId, receiver: userId }
      ]
    })
      .sort({ createdAt: 1 });

    res.json(msgs);
  } catch (err) {
    console.error('getConversation error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const withId = req.params.withId;
    if (!userId || !withId) return res.status(400).json({ message: 'Missing user ids' });

    await Message.updateMany({ sender: withId, receiver: userId, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (err) {
    console.error('markRead error', err);
    res.status(500).json({ message: 'Server error' });
  }
};
const User = require('../models/user');
const pusher = require('../service/pusher');

exports.authenticatePusher = async (req, res) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;
  const userId = req.user?.id;

  if (!socketId || !channel || !userId) {
    return res.status(400).json({ message: 'Missing parameters', code: 400 });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(403).json({ message: 'User not found', code: 403 });

  const expectedChannel = `private-user-${userId}`;
  if (channel !== expectedChannel) {
    return res.status(403).json({ message: 'Pusher Forbidden', code: 403 });
  }

  // Use the non-deprecated API
  const auth = pusher.authorizeChannel(socketId, channel);
  return res.send(auth);
};

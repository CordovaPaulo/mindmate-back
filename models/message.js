const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true},
    receiver: {type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true},
    text: {type: String, required: true},
    read: {type: Boolean, default: false},
    createdAt: {type: Date, default: Date.now},
}, { collection: 'messages' });

const Message = mongoose.model('Message', messageSchema);
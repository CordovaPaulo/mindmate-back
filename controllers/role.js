const User = require('../models/user');
const { getValuesFromToken } = require('../service/jwt');

exports.getRole = async (req, res) => {
    const decoded = getValuesFromToken(req);
    try {
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found', code: 404 });
        }
        return res.status(200).json({ role: user.role, code: 200 });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error', code: 500 });
    }
}
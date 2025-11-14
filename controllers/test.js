exports.ping = (req, res, next) => {
    res.status(200).json({ message: 'Pong! Protected route reached!' });
}
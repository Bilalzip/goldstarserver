const checkSellerRole = (req, res, next) => {
  if (req.user.role !== 'seller') {
    return res.status(403).json({ message: 'Access denied. Seller only.' });
  }
  next();
};

module.exports = { checkSellerRole }; 
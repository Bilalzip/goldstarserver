const validateCouponCode = (code) => {
  // Add your coupon validation logic here
  const codeRegex = /^[A-Z0-9]{4,16}$/;
  return codeRegex.test(code);
};

module.exports = {
  validateCouponCode
}; 
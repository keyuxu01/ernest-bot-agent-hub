/** 邮箱激活令牌有效期（秒） */
const ACTIVATION_TOKEN_TTL_SECONDS = 24 * 3600;

/** 密码重置验证码有效期（秒） */
const RESET_CODE_TTL_SECONDS = 10 * 60;

/** 密码重置验证码重发冷却（秒） */
const RESET_CODE_COOLDOWN_SECONDS = 60;

/** 同一验证码允许输错的次数；达到后验证码作废，需重新获取 */
const RESET_CODE_MAX_ATTEMPTS = 3;

export {
  ACTIVATION_TOKEN_TTL_SECONDS,
  RESET_CODE_COOLDOWN_SECONDS,
  RESET_CODE_MAX_ATTEMPTS,
  RESET_CODE_TTL_SECONDS,
};

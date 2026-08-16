export const ENV = {
  /** Secret for signing session JWTs. Rotating it signs everyone out. */
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",

  /** `users.openId` of the project owner, e.g. `tg:123456789`. */
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",

  /**
   * Telegram username (without `@`) allowed to claim ownership on first login.
   * Only used while no owner exists yet — see `claimOwnershipOnFirstLogin`.
   */
  ownerTelegramUsername: (process.env.OWNER_TELEGRAM_USERNAME ?? "")
    .replace(/^@/, "")
    .toLowerCase(),

  /** Telegram Login Widget. Both are required for sign-in to work. */
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? "",

  /** Local storage directory, used whenever the S3 variables are unset. */
  storageDir: process.env.STORAGE_DIR ?? "storage",

  /** S3-compatible object storage. Setting all four switches the backend to S3. */
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  /** Public base URL of the bucket, when it is served directly by a CDN. */
  s3PublicUrl: process.env.S3_PUBLIC_URL ?? "",

  /** Shared secret for scheduled job callbacks. */
  cronSecret: process.env.CRON_SECRET ?? "",

  isProduction: process.env.NODE_ENV === "production",
};

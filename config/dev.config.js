module.exports = {
  // Database Configuration for EIP Dev
  database: {
    host: process.env.PG_HOST || 'your-eip-dev-db-host',
    user: process.env.PG_USER || 'your-eip-dev-db-user',
    password: process.env.PG_PASSWORD || 'your-eip-dev-db-password',
    database: process.env.PG_DATABASE || 'your-eip-dev-db-name',
    port: process.env.PG_PORT || 5432,
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
  },

  // Azure Storage Configuration for EIP Dev
  azure: {
    accountName: process.env.AZURE_STORAGE_ACCOUNT || 'your-eip-dev-storage-account',
    containerName: process.env.AZURE_CONTAINER_NAME || 'your-eip-dev-container',
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || null,
    useConnectionString: process.env.AZURE_USE_CONNECTION_STRING === 'true'
  },

  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }
  },

  // Security Configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-eip-dev-jwt-secret',
    bcryptRounds: 10,
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200 // Higher limit for dev environment
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'dev'
  },

  // File Upload Configuration
  upload: {
    maxFileSize: process.env.MAX_FILE_SIZE || '10mb',
    allowedMimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'image/jpeg',
      'image/png',
      'image/gif'
    ]
  }
}; 
module.exports = {
  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'your-production-db-host',
    user: process.env.DB_USER || 'your-production-db-user',
    password: process.env.DB_PASSWORD || 'your-production-db-password',
    database: process.env.DB_NAME || 'your-production-db-name',
    port: process.env.DB_PORT || 3306,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  },

  // Azure Storage Configuration
  azure: {
    accountName: process.env.AZURE_STORAGE_ACCOUNT || 'ukssdptldev001',
    containerName: process.env.AZURE_CONTAINER_NAME || 'sdpdevstoragecontainer',
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || null,
    useManagedIdentity: process.env.AZURE_USE_MANAGED_IDENTITY === 'true',
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
    jwtSecret: process.env.JWT_SECRET || 'your-production-jwt-secret',
    bcryptRounds: 12,
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.NODE_ENV === 'production' ? 'json' : 'dev'
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
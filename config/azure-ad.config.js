module.exports = {
  // Azure AD Configuration
  azureAd: {
    // Tenant and Application Configuration
    tenantId: process.env.AZURE_TENANT_ID || 'd1e23d19-ded6-4d66-850c-0d4f35bf2edc',
    clientId: process.env.AZURE_CLIENT_ID || '9e96c018-8b47-4aed-99f2-5a4897bb44a0',
    clientSecret: process.env.AZURE_CLIENT_SECRET || 'zyb8Q~Fh3Iwj_QFWrnd_9rP12LJbwz.jeRMMsbmb',
    
    // OAuth2 Configuration
    authorizationURL: process.env.AZURE_AUTHORIZATION_URL || 
      'https://login.microsoftonline.com/d1e23d19-ded6-4d66-850c-0d4f35bf2edc/oauth2/v2.0/authorize',
    tokenURL: process.env.AZURE_TOKEN_URL || 
      'https://login.microsoftonline.com/d1e23d19-ded6-4d66-850c-0d4f35bf2edc/oauth2/v2.0/token',
    oidcMetadataURL: process.env.AZURE_OIDC_METADATA_URL || 
      'https://login.microsoftonline.com/d1e23d19-ded6-4d66-850c-0d4f35bf2edc/v2.0/.well-known/openid-configuration',
    
    // Scopes and Redirect Configuration
    scope: process.env.AZURE_SCOPE || 'openid profile email 9e96c018-8b47-4aed-99f2-5a4897bb44a0/user_impersonation',
    redirectUri: process.env.AZURE_REDIRECT_URI || 'http://localhost:5000/sso/callback',
    
    // Session Configuration
    sessionSecret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-in-production',
    sessionMaxAge: process.env.SESSION_MAX_AGE || 24 * 60 * 60 * 1000, // 24 hours
    
    // Security Configuration
    csrfSecret: process.env.CSRF_SECRET || 'your-csrf-secret-key-change-in-production',
    
    // Logout Configuration
    logoutRedirectUri: process.env.AZURE_LOGOUT_REDIRECT_URI || 'http://localhost:5000/sso/logout',
    
    // Token Configuration
    tokenValidation: {
      issuer: process.env.AZURE_ISSUER || 'https://login.microsoftonline.com/d1e23d19-ded6-4d66-850c-0d4f35bf2edc/v2.0',
      audience: process.env.AZURE_AUDIENCE || '9e96c018-8b47-4aed-99f2-5a4897bb44a0',
      clockTolerance: 300 // 5 minutes clock skew tolerance
    }
  },
  
  // Environment-specific overrides
  development: {
    redirectUri: 'http://localhost:5000/sso/callback',
    logoutRedirectUri: 'http://localhost:5000/sso/logout'
  },
  
  production: {
    redirectUri: process.env.PROD_REDIRECT_URI || 'https://your-domain.com/auth/callback',
    logoutRedirectUri: process.env.PROD_LOGOUT_REDIRECT_URI || 'https://your-domain.com/auth/logout'
  }
}; 
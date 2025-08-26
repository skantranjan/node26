const axios = require('axios');
const FormData = require('form-data');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const https = require('https');
const pool = require('../config/db.config');

const generatepdf = async (request, reply) => {
  try {
    console.log('=== API CALL STARTED ===');
    console.log('Request isMultipart:', request.isMultipart());

    // Check if file is uploaded - access from request.body since multipart plugin attaches it there
    const fileData = request.body.File;
    const signerEmail = request.body.email?.value || request.body.email; // Get email value from UI
    
    // Safe logging without circular references
    if (fileData) {
      console.log('File data received:', {
        filename: fileData.filename || 'unknown',
        mimetype: fileData.mimetype || 'unknown',
        bufferSize: fileData._buf ? fileData._buf.length : 0,
        hasFile: !!fileData.file
      });
    } else {
      console.log('No file data received');
    }
    
    // Safely log email without circular references
    if (signerEmail && typeof signerEmail === 'object' && signerEmail.value) {
      console.log('Signer email received:', signerEmail.value);
    } else if (typeof signerEmail === 'string') {
      console.log('Signer email received:', signerEmail);
    } else {
      console.log('Signer email received (raw):', JSON.stringify(signerEmail, null, 2));
    }
    
    if (!fileData || !fileData.file) {
      return reply.code(400).send({
        success: false,
        message: 'File is required',
        timestamp: new Date().toISOString()
      });
    }

    // Extract email value safely
    const emailValue = signerEmail?.value || signerEmail;
    
    if (!emailValue || typeof emailValue !== 'string' || !emailValue.includes('@')) {
      return reply.code(400).send({
        success: false,
        message: 'Valid signer email is required',
        timestamp: new Date().toISOString()
      });
    }

    // Step 1: Get Adobe Sign OAuth refresh token
    console.log('=== STEP 1: Getting OAuth Token ===');
    const refreshUrl = 'https://api.eu1.echosign.com/oauth/v2/refresh';
    
    const requestData = {
      grant_type: 'refresh_token',
      client_id: 'ats-59a0706a-60f7-42be-9fc1-cf5aacf5c5cb',
      client_secret: 'eXXjSc_qZHdMkNcCBBzHGW2DLR1m4a1O',
      refresh_token: '3AAABLblqZhBWpF_JvVhjM2acltikyJGMalPlgQm2RgFY9wR3KeI91jCBNaQgC5V19B7D1cUjqK0*'
    };

    // Get new access token with SSL bypass
    const tokenResponse = await axios.post(refreshUrl, requestData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });

    const accessToken = tokenResponse.data.access_token;
    console.log('OAuth Token received successfully');

    // Step 2: Upload file to Adobe Sign transient documents
    console.log('=== STEP 2: Uploading to Adobe Sign ===');
    const transientUrl = 'https://api.eu1.echosign.com/api/rest/v6/transientDocuments';
    
    // Create form data for file upload
    const formData = new FormData();
    
    // Get file details from the multipart data
    const filename = fileData.filename || 'document.pdf';
    const contentType = fileData.mimetype || 'application/pdf';
    const buffer = fileData._buf; // Use the buffer directly
    
    formData.append('File', buffer, {
      filename: filename,
      contentType: contentType
    });

    console.log('Uploading file:', filename, 'Content-Type:', contentType, 'Buffer size:', buffer.length);

    // Upload file using the new access token with SSL bypass
    const uploadResponse = await axios.post(transientUrl, formData, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...formData.getHeaders()
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });

    console.log('File uploaded to Adobe Sign successfully');

    // Step 3: Create Adobe Sign agreement
    console.log('=== STEP 3: Creating Agreement ===');
    const agreementsUrl = 'https://api.eu1.echosign.com/api/rest/v6/agreements';
    
    const agreementData = {
      "participantSetsInfo": [
        {
          "role": "SIGNER",
          "order": 1,
                "memberInfos": [
        {
          "email": emailValue
        }
      ]
        }
      ],
      "name": filename, // Use the uploaded filename
      "signatureType": "ESIGN",
      "fileInfos": [
        {
          "transientDocumentId": uploadResponse.data.transientDocumentId
        }
      ],
      "state": "IN_PROCESS"
    };

    console.log('Creating agreement for email:', emailValue);

    // Create agreement using the access token with SSL bypass
    const agreementResponse = await axios.post(agreementsUrl, agreementData, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });

    const agreementId = agreementResponse.data.id;
    console.log('Agreement created successfully with ID:', agreementId);

    // Step 4: Save agreement details to database
    console.log('=== STEP 4: Saving to Database ===');
    let dbId = null;
    try {
      const status = "IN_PROCESS";
      const createdAt = new Date();

      console.log('Saving agreement to database:', {
        email: emailValue,
        agreement_id: agreementId,
        status: status,
        created_at: createdAt
      });

      const insertQuery = `
        INSERT INTO public.agreements (email, agreement_id, status, created_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `;

      const insertResult = await pool.query(insertQuery, [
        emailValue,
        agreementId,
        status,
        createdAt
      ]);

      dbId = insertResult.rows[0].id;
      console.log('Agreement saved to database with ID:', dbId);

    } catch (dbError) {
      console.error('Database insertion failed:', dbError.message);
      // Continue with the workflow even if DB insertion fails
    }

    // Step 5: Upload file to Azure Blob Storage using proven working method
    console.log('=== STEP 5: Azure Blob Upload ===');
    let azureResult = null;
    try {
      // Use the same Azure configuration as addComponent
      const accountName = process.env.AZURE_STORAGE_ACCOUNT || "ukssdptldev001";
      const containerName = "adobesign"; // Use adobesign container
      const blobUrl = `https://${accountName}.blob.core.windows.net`;
      
      console.log('Azure Configuration:', {
        accountName: accountName,
        containerName: containerName,
        blobUrl: blobUrl,
        environment: process.env.NODE_ENV || 'development'
      });

      // Use the same authentication method as addComponent
      let blobServiceClient;
      if (process.env.NODE_ENV === 'production' && process.env.AZURE_STORAGE_CONNECTION_STRING) {
        // Use connection string for production
        console.log('Using Azure Storage Connection String');
        blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
      } else {
        // Use credential-based authentication (same as addComponent)
        console.log('Using Azure Credentials');
        const { AzureCliCredential } = require("@azure/identity");
        const credential = new AzureCliCredential();
        blobServiceClient = new BlobServiceClient(blobUrl, credential);
      }

      console.log('BlobServiceClient created successfully');
      
      // Get container client
      const containerClient = blobServiceClient.getContainerClient(containerName);
      console.log('Container client created for:', containerName);
      
      // Create a unique blob name with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blobName = `${timestamp}_${filename}`;
      
      console.log('Preparing to upload blob:', blobName);
      
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      // Upload the file buffer to Azure Blob
      console.log('Starting blob upload...');
      const uploadBlobResponse = await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: {
          blobContentType: contentType
        }
      });

      console.log('File uploaded to Azure Blob successfully');

      azureResult = {
        accountName: accountName,
        containerName: containerName,
        blobName: blobName,
        url: blockBlobClient.url,
        etag: uploadBlobResponse.etag
      };

    } catch (azureError) {
      console.error('Azure Blob upload failed:', azureError.message);
      azureResult = {
        error: 'Azure Blob upload failed',
        message: azureError.message
      };
    }

    // Return success response with safe data
    console.log('=== API CALL COMPLETED SUCCESSFULLY ===');
    return reply.send({
      success: true,
      message: 'Complete workflow executed successfully',
      data: {
        oauth: {
          message: 'OAuth token refreshed successfully',
          expires_in: tokenResponse.data.expires_in || 3600
        },
        upload: {
          message: 'File uploaded to Adobe Sign successfully',
          transientDocumentId: uploadResponse.data.transientDocumentId
        },
        agreement: {
          message: 'Agreement created successfully',
          id: agreementId,
          name: filename
        },
        database: {
          message: dbId ? 'Agreement saved to database successfully' : 'Database insertion failed',
          email: emailValue,
          agreement_id: agreementId,
          status: "IN_PROCESS",
          db_id: dbId
        },
        azureBlob: azureResult
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    // Log the error safely without circular references
    console.error('=== API CALL FAILED ===');
    console.error('Error details:', {
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      stack: error.stack ? 'Stack trace available' : 'No stack trace'
    });
    
    // Return safe error response
    return reply.code(500).send({
      success: false,
      message: 'Failed to process request',
      error: {
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR'
      },
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  generatepdf
};

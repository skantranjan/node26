const axios = require('axios');
const FormData = require('form-data');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const https = require('https');

const generatepdf = async (request, reply) => {
  try {
    console.log('Request received:', {
      isMultipart: request.isMultipart(),
      headers: request.headers,
      body: request.body
    });

    // Check if file is uploaded - access from request.body since multipart plugin attaches it there
    const fileData = request.body.File;
    console.log('File data received:', fileData);
    
    if (!fileData || !fileData.file) {
      return reply.code(400).send({
        success: false,
        message: 'File is required',
        timestamp: new Date().toISOString()
      });
    }

    // Step 1: Get Adobe Sign OAuth refresh token
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
    console.log('New Access Token received:', accessToken);

    // Step 2: Upload file to Adobe Sign transient documents
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

    console.log('File uploaded successfully:', uploadResponse.data);

    // Step 3: Create Adobe Sign agreement
    const agreementsUrl = 'https://api.eu1.echosign.com/api/rest/v6/agreements';
    
    const agreementData = {
      "participantSetsInfo": [
        {
          "role": "SIGNER",
          "order": 1,
          "memberInfos": [
            {
              "email": "shashi.p.kant@haleon.com"
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

    console.log('Creating agreement with data:', agreementData);

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

    console.log('Agreement created successfully:', agreementResponse.data);

    // Step 4: Upload file to Azure Blob Storage using proven working method
    try {
      console.log('=== AZURE BLOB UPLOAD STARTED ===');
      
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
        console.log('🔑 Using Azure Storage Connection String');
        blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
      } else {
        // Use credential-based authentication (same as addComponent)
        console.log('🔑 Using Azure Credentials');
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

      console.log('File uploaded to Azure Blob successfully:', {
        accountName: accountName,
        containerName: containerName,
        blobName: blobName,
        url: blockBlobClient.url,
        etag: uploadBlobResponse.etag
      });

      // Return all four responses
      return reply.send({
        success: true,
        message: 'OAuth token refreshed, file uploaded to Adobe Sign, agreement created, and file uploaded to Azure Blob successfully',
        data: {
          oauth: tokenResponse.data,
          upload: uploadResponse.data,
          agreement: agreementResponse.data,
          azureBlob: {
            accountName: accountName,
            containerName: containerName,
            blobName: blobName,
            url: blockBlobClient.url,
            etag: uploadBlobResponse.etag
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (azureError) {
      console.error('=== AZURE BLOB UPLOAD FAILED ===');
      console.error('Error details:', {
        message: azureError.message,
        stack: azureError.stack,
        code: azureError.code,
        statusCode: azureError.statusCode
      });
      
      // Return response without Azure Blob data if it fails
      return reply.send({
        success: true,
        message: 'OAuth token refreshed, file uploaded to Adobe Sign, and agreement created successfully. Azure Blob upload failed.',
        data: {
          oauth: tokenResponse.data,
          upload: uploadResponse.data,
          agreement: agreementResponse.data,
          azureBlob: {
            error: 'Azure Blob upload failed',
            message: azureError.message,
            code: azureError.code,
            statusCode: azureError.statusCode
          }
        },
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    // Log the error
    console.error('Error in generatepdf API:', error.response?.data || error.message);
    
    // Return error response
    return reply.code(error.response?.status || 500).send({
      success: false,
      message: 'Failed to process request',
      error: error.response?.data || error.message,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  generatepdf
};

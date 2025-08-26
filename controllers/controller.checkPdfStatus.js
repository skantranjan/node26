const axios = require('axios');
const https = require('https');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const pool = require('../config/db.config');

const checkPdfStatus = async (request, reply) => {
  try {
    console.log('=== CHECK PDF STATUS API STARTED ===');
    
    // Step 1: Get all agreements from database that need status checking
    console.log('=== STEP 1: Fetching agreements from database ===');
    const selectQuery = `
      SELECT id, email, agreement_id, status, created_at 
      FROM public.agreements 
      WHERE status != 'COMPLETED' AND status != 'CANCELLED' AND status != 'EXPIRED'
      ORDER BY created_at ASC
    `;
    
    const agreementsResult = await pool.query(selectQuery);
    const agreements = agreementsResult.rows;
    
    console.log(`Found ${agreements.length} agreements to check in database`);
    
    if (agreements.length === 0) {
      return reply.send({
        success: true,
        message: 'No agreements found that need status checking',
        data: {
          agreementsChecked: 0,
          statusUpdates: 0,
          filesDownloaded: 0
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Step 2: Get Adobe Sign OAuth token for API calls
    console.log('=== STEP 2: Getting OAuth Token ===');
    const refreshUrl = 'https://api.eu1.echosign.com/oauth/v2/refresh';
    
    const requestData = {
      grant_type: 'refresh_token',
      client_id: 'ats-59a0706a-60f7-42be-9fc1-cf5aacf5c5cb',
      client_secret: 'eXXjSc_qZHdMkNcCBBzHGW2DLR1m4a1O',
      refresh_token: '3AAABLblqZhBWpF_JvVhjM2acltikyJGMalPlgQm2RgFY9wR3KeI91jCBNaQgC5V19B7D1cUjqK0*'
    };

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
    
    // Step 3: Get ALL agreements list from Adobe Sign
    console.log('=== STEP 3: Fetching agreements list from Adobe Sign ===');
    const agreementsListUrl = 'https://api.eu1.echosign.com/api/rest/v6/agreements';
    
    const agreementsResponse = await axios.get(agreementsListUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
    
    const adobeAgreements = agreementsResponse.data.userAgreementList || [];
    console.log(`Found ${adobeAgreements.length} agreements in Adobe Sign`);
    
    // Step 4: Match agreements and update statuses
    console.log('=== STEP 4: Matching and updating agreement statuses ===');
    let statusUpdates = 0;
    let filesDownloaded = 0;
    const results = [];
    
    for (const dbAgreement of agreements) {
      try {
        // Find matching agreement in Adobe Sign response
        const adobeAgreement = adobeAgreements.find(ag => ag.id === dbAgreement.agreement_id);
        
        if (!adobeAgreement) {
          console.log(`No Adobe Sign agreement found for ID: ${dbAgreement.agreement_id}`);
          results.push({
            id: dbAgreement.id,
            email: dbAgreement.email,
            agreement_id: dbAgreement.agreement_id,
            oldStatus: dbAgreement.status,
            newStatus: dbAgreement.status,
            adobeStatus: 'NOT_FOUND',
            updated: false,
            error: 'Agreement not found in Adobe Sign'
          });
          continue;
        }
        
        const adobeStatus = adobeAgreement.status;
        console.log(`Adobe Sign status for ${dbAgreement.agreement_id}: ${adobeStatus}`);
        
        // Map Adobe Sign status to our database status
        let newStatus = dbAgreement.status; // Keep current status by default
        
        switch (adobeStatus) {
          case 'OUT_FOR_SIGNATURE':
            newStatus = 'IN_PROCESS';
            break;
          case 'SIGNED':
            newStatus = 'SIGNED';
            break;
          case 'COMPLETED':
            newStatus = 'COMPLETED';
            break;
          case 'CANCELLED':
            newStatus = 'CANCELLED';
            break;
          case 'EXPIRED':
            newStatus = 'EXPIRED';
            break;
          default:
            newStatus = adobeStatus; // Use Adobe's status if we don't have a mapping
        }
        
        // Update database if status changed
        if (newStatus !== dbAgreement.status) {
          console.log(`Status changed for ${dbAgreement.agreement_id}: ${dbAgreement.status} → ${newStatus}`);
          
          const updateQuery = `
            UPDATE public.agreements 
            SET status = $1, updated_at = $2, adobe_status = $3
            WHERE id = $4
          `;
          
          await pool.query(updateQuery, [
            newStatus,
            new Date(),
            adobeStatus,
            dbAgreement.id
          ]);
          
          statusUpdates++;
          console.log(`Database updated for agreement ID: ${dbAgreement.id}`);
        }
        
        // Step 5: Download and upload completed agreements to Azure Blob
        if (newStatus === 'COMPLETED' || newStatus === 'SIGNED') {
          try {
            console.log(`Downloading completed agreement: ${dbAgreement.agreement_id}`);
            
            // Download the combined document from Adobe Sign
            const downloadUrl = `https://api.eu1.echosign.com/api/rest/v6/agreements/${dbAgreement.agreement_id}/combinedDocument`;
            
            const fileResponse = await axios.get(downloadUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/pdf'
              },
              responseType: 'arraybuffer',
              httpsAgent: new https.Agent({
                rejectUnauthorized: false
              })
            });
            
            const fileBuffer = Buffer.from(fileResponse.data);
            console.log(`Downloaded file size: ${fileBuffer.length} bytes`);
            
            // Upload to Azure Blob Storage
            const azureResult = await uploadToAzureBlob(fileBuffer, dbAgreement.agreement_id, 'application/pdf');
            
            if (azureResult.success) {
              // Update database with blob URL
              const updateBlobQuery = `
                UPDATE public.agreements 
                SET signed_pdf_url = $1, blob_uploaded_at = $2
                WHERE id = $3
              `;
              
              await pool.query(updateBlobQuery, [
                azureResult.url,
                new Date(),
                dbAgreement.id
              ]);
              
              filesDownloaded++;
              console.log(`File uploaded to Azure Blob and database updated for agreement: ${dbAgreement.agreement_id}`);
            }
            
          } catch (downloadError) {
            console.error(`Error downloading agreement ${dbAgreement.agreement_id}:`, downloadError.message);
          }
        }
        
        results.push({
          id: dbAgreement.id,
          email: dbAgreement.email,
          agreement_id: dbAgreement.agreement_id,
          oldStatus: dbAgreement.status,
          newStatus: newStatus,
          adobeStatus: adobeStatus,
          updated: newStatus !== dbAgreement.status,
          fileDownloaded: (newStatus === 'COMPLETED' || newStatus === 'SIGNED')
        });
        
      } catch (agreementError) {
        console.error(`Error processing agreement ${dbAgreement.agreement_id}:`, agreementError.message);
        
        results.push({
          id: dbAgreement.id,
          email: dbAgreement.email,
          agreement_id: dbAgreement.agreement_id,
          oldStatus: dbAgreement.status,
          newStatus: dbAgreement.status,
          adobeStatus: 'ERROR',
          updated: false,
          error: agreementError.message
        });
      }
    }
    
    // Step 6: Return results
    console.log('=== CHECK PDF STATUS API COMPLETED ===');
    console.log(`Total agreements checked: ${agreements.length}`);
    console.log(`Status updates made: ${statusUpdates}`);
    console.log(`Files downloaded and uploaded: ${filesDownloaded}`);
    
    return reply.send({
      success: true,
      message: 'PDF status check completed successfully',
      data: {
        agreementsChecked: agreements.length,
        statusUpdates: statusUpdates,
        filesDownloaded: filesDownloaded,
        results: results
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('=== CHECK PDF STATUS API FAILED ===');
    console.error('Error details:', {
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      stack: error.stack ? 'Stack trace available' : 'No stack trace'
    });
    
    return reply.code(500).send({
      success: false,
      message: 'Failed to check PDF status',
      error: {
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR'
      },
      timestamp: new Date().toISOString()
    });
  }
};

// Helper function to upload file to Azure Blob Storage
const uploadToAzureBlob = async (fileBuffer, agreementId, contentType) => {
  try {
    // Use the same Azure configuration as other controllers
    const accountName = process.env.AZURE_STORAGE_ACCOUNT || "ukssdptldev001";
    const containerName = "adobesign";
    const blobUrl = `https://${accountName}.blob.core.windows.net`;
    
    console.log('Azure Configuration:', {
      accountName: accountName,
      containerName: containerName,
      blobUrl: blobUrl
    });

    // Use the same authentication method as other controllers
    let blobServiceClient;
    if (process.env.NODE_ENV === 'production' && process.env.AZURE_STORAGE_CONNECTION_STRING) {
      console.log('Using Azure Storage Connection String');
      blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    } else {
      console.log('Using Azure Credentials');
      const { AzureCliCredential } = require("@azure/identity");
      const credential = new AzureCliCredential();
      blobServiceClient = new BlobServiceClient(blobUrl, credential);
    }
    
    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Create a unique blob name with timestamp and agreement ID
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blobName = `signed-pdfs/${timestamp}_${agreementId}.pdf`;
    
    console.log('Preparing to upload blob:', blobName);
    
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    // Upload the file buffer to Azure Blob
    const uploadBlobResponse = await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
      blobHTTPHeaders: {
        blobContentType: contentType
      }
    });

    console.log('File uploaded to Azure Blob successfully');
    
    return {
      success: true,
      accountName: accountName,
      containerName: containerName,
      blobName: blobName,
      url: blockBlobClient.url,
      etag: uploadBlobResponse.etag
    };

  } catch (azureError) {
    console.error('Azure Blob upload failed:', azureError.message);
    return {
      success: false,
      error: 'Azure Blob upload failed',
      message: azureError.message
    };
  }
};

module.exports = {
  checkPdfStatus
};

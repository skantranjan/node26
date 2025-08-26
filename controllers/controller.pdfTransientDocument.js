const axios = require('axios');
const FormData = require('form-data');

const pdfTransientDocument = async (request, reply) => {
  try {
    // Get the bearer token from the request body
    const { bearerToken } = request.body;
    
    // Check if bearer token is provided
    if (!bearerToken) {
      return reply.code(400).send({
        success: false,
        message: 'Bearer token is required',
        timestamp: new Date().toISOString()
      });
    }

    // Check if file is uploaded
    const file = request.file;
    if (!file) {
      return reply.code(400).send({
        success: false,
        message: 'File is required',
        timestamp: new Date().toISOString()
      });
    }

    // Adobe Sign transient documents endpoint
    const transientUrl = 'https://api.eu1.echosign.com/api/rest/v6/transientDocuments';
    
    // Create form data for file upload
    const formData = new FormData();
    formData.append('File', file.buffer, {
      filename: file.filename,
      contentType: file.mimetype
    });

    // Make POST request to Adobe Sign transient documents endpoint
    const response = await axios.post(transientUrl, formData, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        ...formData.getHeaders()
      }
    });

    // Log the data received from Adobe Sign
    console.log('Adobe Sign Transient Document Response:', response.data);

    // Return the response from Adobe Sign
    return reply.send({
      success: true,
      message: 'File uploaded to Adobe Sign transient documents successfully',
      data: response.data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    // Log the error
    console.error('Error calling Adobe Sign Transient Documents API:', error.response?.data || error.message);
    
    // Return error response
    return reply.code(error.response?.status || 500).send({
      success: false,
      message: 'Failed to upload file to Adobe Sign transient documents',
      error: error.response?.data || error.message,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  pdfTransientDocument
};

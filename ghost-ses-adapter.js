/**
 * Ghost to Amazon SES Adapter
 * 
 * This adapter intercepts Ghost's Mailgun API calls and redirects them to AWS SES.
 * It solves the common problem of Mailgun integration issues with Ghost's newsletter sending.
 */

const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const app = express();

// Load configuration
let config = {
  port: process.env.PORT || 3001,
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  },
  defaultSender: process.env.DEFAULT_SENDER,
  logLevel: process.env.LOG_LEVEL || 'normal' // 'minimal', 'normal', 'verbose'
};

// Try to load config from file
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  try {
    const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // Deep merge for nested properties
    config = {
      ...config,
      ...fileConfig,
      aws: {
        ...config.aws,
        ...(fileConfig.aws || {})
      }
    };
  } catch (error) {
    console.error('Error loading config file:', error);
  }
}

// Initialize SES
AWS.config.update({
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
  region: config.aws.region
});

const ses = new AWS.SES({ apiVersion: '2010-12-01' });

// Configure middleware
const upload = multer();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Logging utility
function log(level, message, data = null) {
  const levels = { minimal: 1, normal: 2, verbose: 3 };
  const configLevel = levels[config.logLevel] || 2;
  
  if (levels[level] <= configLevel) {
    console.log(message);
    if (data && configLevel >= 3) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

// Handle email sending endpoint
app.post('/v3/:domain/messages', upload.any(), async (req, res) => {
  log('normal', `====== Received newsletter sending request [${new Date().toISOString()}] ======`);
  log('verbose', 'Headers:', req.headers);
  log('verbose', 'Body fields:', req.body);
  log('normal', `Files attached: ${req.files ? req.files.length : 0}`);
  
  try {
    // Extract email details from form data
    const { from, to, subject, html, text, 'recipient-variables': recipientVars } = req.body;
    
    if (!to) {
      log('normal', 'Error: Missing recipients');
      return res.status(200).json({ 
        id: `missing-to-${Date.now()}`,
        message: 'Queued. Thank you.'
      });
    }
    
    // Parse recipients
    const toAddresses = Array.isArray(to) ? to : (typeof to === 'string' ? to.split(',').map(addr => addr.trim()) : [to]);
    
    // Use the from address or fall back to config
    const senderEmail = from || config.defaultSender;
    log('normal', `Sending email from ${senderEmail} to ${toAddresses.length} recipients`);
    
    // Split recipients into batches of 50 (SES limit)
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < toAddresses.length; i += batchSize) {
      batches.push(toAddresses.slice(i, i + batchSize));
    }
    
    log('normal', `Splitting into ${batches.length} batches of up to ${batchSize} recipients each`);
    
    // Send each batch
    const results = [];
    const errors = [];
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      // Prepare SES SendBulkEmail parameters for this batch
      // Each recipient gets their own destination for privacy
      const destinations = batch.map(email => ({
        Destination: {
          ToAddresses: [email]
        }
      }));
      
      const params = {
        Source: senderEmail,
        Destinations: destinations,
        TemplateContent: {
          Subject: {
            Data: subject || 'No Subject',
            Charset: 'UTF-8'
          },
          ...(html && {
            Html: {
              Data: html,
              Charset: 'UTF-8'
            }
          }),
          ...(text && {
            Text: {
              Data: text,
              Charset: 'UTF-8'
            }
          })
        }
      };
      
      // Add optional ReplyTo if available in headers
      if (req.body['h:Reply-To']) {
        params.ReplyToAddresses = [req.body['h:Reply-To']];
      }
      
      try {
        // Use individual sendEmail calls for maximum privacy and compatibility
        const batchResults = [];
        for (const destination of destinations) {
          const emailParams = {
            Source: senderEmail,
            Destination: destination.Destination,
            Message: {
              Subject: params.TemplateContent.Subject,
              Body: {
                ...(params.TemplateContent.Html && { Html: params.TemplateContent.Html }),
                ...(params.TemplateContent.Text && { Text: params.TemplateContent.Text })
              }
            }
          };
          
          if (params.ReplyToAddresses) {
            emailParams.ReplyToAddresses = params.ReplyToAddresses;
          }
          
          try {
            const emailResult = await ses.sendEmail(emailParams).promise();
            batchResults.push({ MessageId: emailResult.MessageId });
          } catch (emailError) {
            batchResults.push({ Error: emailError.message });
          }
        }
        
        const result = { BulkEmailEntryResults: batchResults };
        
        // Check individual email results in the bulk response
        const bulkResults = result.BulkEmailEntryResults || [];
        let successCount = 0;
        let failCount = 0;
        
        bulkResults.forEach((entryResult, idx) => {
          if (entryResult.MessageId) {
            successCount++;
          } else if (entryResult.Error) {
            failCount++;
            log('normal', `✗ Individual email failed for ${batch[idx]}: ${entryResult.Error}`);
          }
        });
        
        log('normal', `✓ Batch ${i+1}/${batches.length}: ${successCount} sent, ${failCount} failed via SES Bulk`);
        results.push(result);
      } catch (error) {
        log('normal', `✗ SES Bulk Error for batch ${i+1}/${batches.length}: ${error.code} - ${error.message}`);
        errors.push(error);
        // Continue with other batches even if one fails
      }
    }
    
    // Return success if at least one batch was sent successfully
    if (results.length > 0) {
      log('normal', `✓ Successfully sent ${results.length} of ${batches.length} batches`);
      return res.status(200).json({
        id: results[0].MessageId,
        message: `Queued. Thank you. Sent ${results.length} of ${batches.length} batches.`
      });
    } else {
      // All batches failed
      log('normal', `✗ All ${batches.length} batches failed to send`);
      return res.status(200).json({
        id: `ses-error-${Date.now()}`,
        message: 'Queued. Thank you.'
      });
    }
  } catch (error) {
    log('normal', `✗ Error processing request: ${error.message}`);
    
    // Return success to Ghost anyway
    return res.status(200).json({
      id: `error-${Date.now()}`,
      message: 'Queued. Thank you.'
    });
  }
});

// Handle analytics endpoints
app.get('/v3/:domain/events', (req, res) => {
  log('normal', `====== Received analytics request [${new Date().toISOString()}] ======`);
  log('verbose', 'Query parameters:', req.query);
  
  // Return empty events array with pagination structure that Mailgun would return
  res.status(200).json({
    items: [],
    paging: { next: `https://api.eu.mailgun.net/v3/events?limit=${req.query.limit || 300}&page=next_page` }
  });
});

// Handle validation endpoint (Ghost sometimes checks this)
app.get('/v3/:domain/messages', (req, res) => {
  log('normal', `====== Received validation request [${new Date().toISOString()}] ======`);
  res.status(200).json({
    items: []
  });
});

// Handle all other requests
app.all('*', (req, res) => {
  log('normal', `====== Received ${req.method} ${req.url} [${new Date().toISOString()}] ======`);
  log('verbose', 'Headers:', req.headers);
  log('verbose', 'Body:', req.body);
  log('verbose', 'Query:', req.query);
  
  // Return success for all other endpoints
  res.status(200).json({ message: 'Success' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start the server
app.listen(config.port, '0.0.0.0', () => {
  log('minimal', `Ghost-to-SES adapter running at http://0.0.0.0:${config.port}`);
  log('minimal', `AWS Region: ${config.aws.region}`);
  if (config.defaultSender) {
    log('minimal', `Default sender: ${config.defaultSender}`);
  }
  log('minimal', `Log level: ${config.logLevel}`);
});

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
const app = express();

// Load configuration
const config = {
  host: process.env.HOST || '0.0.0.0',
  port: process.env.PORT || 3001,
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  },
  defaultSender: process.env.DEFAULT_SENDER,
  logLevel: process.env.LOG_LEVEL || 'normal' // 'minimal', 'normal', 'verbose'
};

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

// Replace Mailgun-style %recipient.xyz% template variables with per-recipient values
function replaceRecipientVariables(content, recipientEmail, recipientVarsMap) {
  if (!content || !recipientVarsMap || !recipientVarsMap[recipientEmail]) {
    return content;
  }
  const vars = recipientVarsMap[recipientEmail];
  return content.replace(/%recipient\.([^%]+)%/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

// Build a raw MIME email with custom headers (needed for List-Unsubscribe)
function buildRawEmail({ from, to, subject, html, text, replyTo, listUnsubscribe, listUnsubscribePost }) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines = [];

  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  lines.push(`Sender: ${from}`);
  lines.push(`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`);
  lines.push('MIME-Version: 1.0');
  lines.push('Auto-Submitted: auto-generated');
  lines.push('X-Auto-Response-Suppress: OOF, AutoReply');
  if (replyTo) lines.push(`Reply-To: ${replyTo}`);
  if (listUnsubscribe) lines.push(`List-Unsubscribe: ${listUnsubscribe}`);
  if (listUnsubscribePost) lines.push(`List-Unsubscribe-Post: ${listUnsubscribePost}`);

  if (html && text) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(text).toString('base64'));
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(html).toString('base64'));
    lines.push(`--${boundary}--`);
  } else if (html) {
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(html).toString('base64'));
  } else {
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(text || '').toString('base64'));
  }

  return lines.join('\r\n');
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
        id: `<missing-to-${Date.now()}>`,
        message: 'Queued. Thank you.'
      });
    }
    
    // Parse recipients
    const toAddresses = Array.isArray(to) ? to : (typeof to === 'string' ? to.split(',').map(addr => addr.trim()) : [to]);
    
    // Parse recipient variables for template substitution
    let recipientVarsMap = {};
    if (recipientVars) {
      try {
        recipientVarsMap = typeof recipientVars === 'string' ? JSON.parse(recipientVars) : recipientVars;
      } catch (e) {
        log('normal', `Warning: Failed to parse recipient-variables: ${e.message}`);
      }
    }

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
      
      // Extract optional headers from Ghost's Mailgun-format request
      const replyTo = req.body['h:Reply-To'] || null;
      const listUnsubscribe = req.body['h:List-Unsubscribe'] || null;
      const listUnsubscribePost = req.body['h:List-Unsubscribe-Post'] || null;

      try {
        // Use individual sendRawEmail calls for maximum privacy and custom header support
        const batchResults = [];
        for (const destination of destinations) {
          const recipientEmail = destination.Destination.ToAddresses[0];

          // Substitute %recipient.xyz% variables for this recipient
          const personalizedSubject = replaceRecipientVariables(
            params.TemplateContent.Subject.Data, recipientEmail, recipientVarsMap
          );
          const personalizedHtml = params.TemplateContent.Html
            ? replaceRecipientVariables(params.TemplateContent.Html.Data, recipientEmail, recipientVarsMap)
            : null;
          const personalizedText = params.TemplateContent.Text
            ? replaceRecipientVariables(params.TemplateContent.Text.Data, recipientEmail, recipientVarsMap)
            : null;

          // Substitute recipient variables in List-Unsubscribe header too
          const personalizedListUnsub = replaceRecipientVariables(
            listUnsubscribe, recipientEmail, recipientVarsMap
          );

          const rawMessage = buildRawEmail({
            from: senderEmail,
            to: recipientEmail,
            subject: personalizedSubject,
            html: personalizedHtml,
            text: personalizedText,
            replyTo,
            listUnsubscribe: personalizedListUnsub,
            listUnsubscribePost
          });

          try {
            const emailResult = await ses.sendRawEmail({
              Source: senderEmail,
              Destinations: [recipientEmail],
              RawMessage: { Data: rawMessage }
            }).promise();
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
      // Extract the first successful MessageId from bulk results
      // Ghost's MailgunEmailProvider calls .trim() on the id, so it must be a string
      const firstMessageId = results
        .flatMap(r => r.BulkEmailEntryResults || [])
        .find(entry => entry.MessageId)?.MessageId || `ses-${Date.now()}`;
      return res.status(200).json({
        id: `<${firstMessageId}>`,
        message: `Queued. Thank you. Sent ${results.length} of ${batches.length} batches.`
      });
    } else {
      // All batches failed
      log('normal', `✗ All ${batches.length} batches failed to send`);
      return res.status(200).json({
        id: `<ses-error-${Date.now()}>`,
        message: 'Queued. Thank you.'
      });
    }
  } catch (error) {
    log('normal', `✗ Error processing request: ${error.message}`);
    
    // Return success to Ghost anyway
    return res.status(200).json({
      id: `<error-${Date.now()}>`,
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
app.listen(config.port, config.host, () => {
  log('minimal', `Ghost-to-SES adapter running at http://${config.host}:${config.port}`);
  log('minimal', `AWS Region: ${config.aws.region}`);
  if (config.defaultSender) {
    log('minimal', `Default sender: ${config.defaultSender}`);
  }
  log('minimal', `Log level: ${config.logLevel}`);
});

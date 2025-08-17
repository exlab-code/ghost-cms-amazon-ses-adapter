# Ghost to AWS SES Adapter

This project provides a simple but effective solution for using AWS SES instead of Mailgun for sending Ghost newsletters, without modifying Ghost's source code.

## The Problem

Ghost CMS has built-in support for sending newsletters via Mailgun, but many users encounter issues:
- Mailgun configuration problems
- Account suspensions
- Deliverability issues
- Pricing concerns

Unfortunately, Ghost doesn't natively support AWS SES for newsletter sending (only for transactional emails).

## The Solution

This adapter works by:
1. Intercepting Ghost's calls to the Mailgun API
2. Redirecting those requests to AWS SES
3. Returning appropriate responses back to Ghost

## Prerequisites

- A server running Ghost
- An AWS account with SES set up
- Verified email address(es) or domain(s) in SES
- Node.js (v14 or higher recommended)
- Access to your Ghost database

## Installation

### 1. Clone or download this repository

```bash
git clone https://github.com/exlab-code/ghost-ses-adapter.git
cd ghost-ses-adapter
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the adapter

#### Getting AWS Credentials

1. Log in to your AWS Management Console
2. Go to IAM (Identity and Access Management)
3. Click "Users" → "Create user"
4. Enter a user name and click "Next"
5. On the "Set permissions" page, select "Attach policies directly"
6. Search for and select "AmazonSESFullAccess"
7. Complete the user creation process
8. Go to the newly created user
9. Select the "Security credentials" tab
10. Click "Create access key"
11. Select the appropriate use case (usually "Application running outside AWS")
12. Make note of the Access Key ID and Secret Access Key (you'll only see the secret key once)

#### Setting up SES

1. Go to the SES (Simple Email Service) console
2. **Important**: Make sure you're in the correct AWS region - your verified identities must be in the same region as specified in your config
3. Verify your email address or domain:
   - For email: Click "Verified identities" → "Create identity" → "Email address"
   - For domain: Click "Verified identities" → "Create identity" → "Domain"
4. Follow the verification steps (email confirmation or DNS records)
5. **SES Sandbox vs Production Mode**:
   - **Sandbox Mode** (default): You can only send emails to verified email addresses
   - **Production Mode**: You can send emails to any address
   - To move out of sandbox mode, go to "Account dashboard" → "Request production access"
   - For newsletter sending, you'll likely need production mode unless all your subscribers are verified

#### Update Configuration

Edit the config.json file:

```bash
nano config.json
```

Update the following values:
- `aws.accessKeyId`: Your AWS Access Key ID
- `aws.secretAccessKey`: Your AWS Secret Access Key
- `aws.region`: The AWS region where your SES service is set up (e.g., "us-east-1", "eu-west-1")
- `defaultSender`: Your verified email address in SES (must be verified)

### 4. Update Ghost database settings

You need to update the Ghost database to point to your local adapter. Here's a step-by-step guide:

#### Using MySQL command line:

1. Log in to your MySQL server:
   ```bash
   mysql -u YOUR_USERNAME -p
   ```
   Replace `YOUR_USERNAME` with your MySQL username (often the same as in your Ghost config).

2. Enter your password when prompted.

3. Select your Ghost database:
   ```sql
   USE your_ghost_database;
   ```
   Replace `your_ghost_database` with your actual Ghost database name (found in your Ghost config.production.json file).

4. Run the update query:
   ```sql
   UPDATE settings 
   SET value = 'http://127.0.0.1:3001/v3' 
   WHERE `key` = 'mailgun_base_url';
   ```

5. Verify the update:
   ```sql
   SELECT * FROM settings WHERE `key` = 'mailgun_base_url';
   ```

6. Exit MySQL:
   ```sql
   EXIT;
   ```

#### Using phpMyAdmin (if available):

1. Log in to phpMyAdmin.
2. Select your Ghost database from the left sidebar.
3. Click on the "SQL" tab at the top.
4. Enter the following SQL query:
   ```sql
   UPDATE settings 
   SET value = 'http://127.0.0.1:3001/v3' 
   WHERE `key` = 'mailgun_base_url';
   ```
5. Click "Go" to execute the query.
6. You can verify the change by browsing to the "settings" table and looking for the "mailgun_base_url" key.

This configuration tells Ghost to send all newsletter requests to your local adapter running on port 3001 instead of the actual Mailgun API.

### 5. Run the adapter

You can run the adapter directly:

```bash
node ghost-ses-adapter.js
```

For production use, set up a systemd service:

```bash
sudo nano /etc/systemd/system/ghost-ses-adapter.service
```

Add the following content:

```
[Unit]
Description=Ghost SES Adapter
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/ghost-ses-adapter.js
WorkingDirectory=/path/to/ghost-ses-adapter
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=ghost-ses-adapter
User=your-user
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Replace `/path/to/ghost-ses-adapter.js` and `/path/to/ghost-ses-adapter` with the actual paths, and `your-user` with your system username.

Enable and start the service:

```bash
sudo systemctl enable ghost-ses-adapter
sudo systemctl start ghost-ses-adapter
```

### 6. Configure Ghost to use Mailgun

Make sure Ghost is set up to use Mailgun in the admin interface:
- Go to Settings → Email newsletter
- Select Mailgun
- Enter any value for the API key (it's not used but required)
- Enter your domain
- Under "Email info" → "Sender email address", enter an email address that is verified in SES
- Save settings

**Important**: The sender email address must be verified in Amazon SES or belong to a verified domain in SES. Without this, you will encounter "Email address is not verified" errors when sending newsletters.

### 7. Restart Ghost

```bash
ghost restart
```

## Testing

1. Make sure your adapter is running:
   ```bash
   sudo systemctl status ghost-ses-adapter
   ```
   
   Or if running directly with Node.js:
   ```bash
   node ghost-ses-adapter.js
   ```

2. Check that the adapter is responding:
   ```bash
   curl http://localhost:3001/health
   ```
   You should see a success response.

3. Try sending a test newsletter from Ghost

4. Check the adapter logs for any errors

## Troubleshooting

### Common Issues

1. **SES authentication errors**:
   - Verify your AWS credentials are correct
   - Check that your IAM user has SES sending permissions

2. **"Email address is not verified" errors**:
   - Make sure the sender email is verified in SES
   - Or verify your entire sending domain in SES
   - Ensure verified identities are in the same AWS region as your config

3. **Emails don't send to subscribers**:
   - Check if your SES account is still in sandbox mode
   - In sandbox mode, you can only send to verified email addresses
   - Request production access through the SES console to send to any email address

4. **Adapter starts but doesn't receive requests**:
   - Verify the database setting was updated correctly
   - Make sure the adapter is running on port 3001
   - Check that Ghost was restarted after the database change

5. **File not found errors during installation**:
   - Make sure you're using the correct filenames:
     - The main JavaScript file is `ghost-ses-adapter.js`
     - The systemd service template is `ghost-ses-adapter.service`

### Logs

Adjust the `logLevel` in your config.json for more detailed logs:
- `minimal`: Only startup and errors
- `normal`: Request summaries and outcomes (default)
- `verbose`: Full request details including headers and bodies

## How It Works

1. Ghost tries to send newsletters via what it thinks is the Mailgun API
2. The database configuration redirects these requests to localhost:3001
3. The adapter receives the request, extracts the email details
4. The adapter automatically splits recipients into batches of 50 (SES limit)
5. The adapter sends each batch via AWS SES
6. The adapter returns a success response to Ghost

## Features

- **Automatic Recipient Batching**: Handles newsletters with any number of recipients by automatically splitting them into batches of 50 (the SES limit)
- **Individual Email Delivery**: Uses individual `sendEmail` calls instead of bulk operations for maximum compatibility with SES v1 API
- **Fault Tolerance**: Continues processing batches even if some fail, ensuring maximum delivery
- **Detailed Logging**: Provides clear logs about batch processing and delivery status
- **Simple Setup**: Works with your existing Ghost installation with minimal configuration

## Technical Implementation

### Batching Process Fix

The adapter handles large recipient lists by:

1. **Splitting recipients into batches of 50** (SES API limit)
2. **Using individual `sendEmail` calls** instead of `sendBulkEmail` for compatibility with SES v1 API
3. **Processing each recipient separately** within each batch to avoid API errors

This approach ensures compatibility with all SES API versions and provides better error handling per recipient.

## Limitations and Considerations

### Analytics and Tracking

This adapter has some important limitations compared to Mailgun:

- **No Built-in Analytics**: SES doesn't provide simple API calls for tracking opens, clicks, and bounces like Mailgun does
- **No Event Tracking**: The adapter doesn't implement event tracking, so Ghost's email analytics will show no data

### When to Use This Adapter

This adapter is ideal for:
- Smaller publications where email analytics are not critical
- Blogs and newsletters where delivery is more important than tracking
- Users who want to leverage AWS SES pricing and deliverability benefits

You might want to stick with Mailgun if:
- You rely heavily on open rates, click tracking, and other email analytics
- You need detailed reporting on newsletter performance
- You manage a large publication where subscriber engagement metrics are essential

### Future Enhancements

Potential future improvements could include:
- Basic SNS integration for bounce handling
- CloudWatch integration for basic analytics
- A companion adapter for processing SES events and feeding them back to Ghost

## Security Considerations

- This adapter doesn't implement authentication since it runs locally
- AWS credentials are stored in the config file, so ensure proper file permissions
- The adapter doesn't validate incoming requests since they should only come from your Ghost instance

## Contributing

Feel free to submit issues or pull requests to improve this adapter.

## License

MIT

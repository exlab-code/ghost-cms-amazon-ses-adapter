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

This is done by changing your DNS settings to redirect Mailgun's domain to your adapter, effectively functioning as a "man-in-the-middle" between Ghost and email services.

## Prerequisites

- A server running Ghost
- An AWS account with SES set up
- Verified email address(es) or domain(s) in SES
- Node.js (v14 or higher recommended)
- Basic knowledge of DNS, Nginx and systemd

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

Copy the example config file and edit it:

```bash
cp config.example.json config.json
nano config.json
```

Update the following values:
- AWS access key and secret key with SES permissions
- AWS region where your SES service is set up
- Default sender email (must be verified in SES)

### 4. Set up Nginx as a proxy

Copy the provided Nginx configuration:

```bash
sudo cp mailgun-proxy.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/mailgun-proxy.conf /etc/nginx/sites-enabled/
```

Edit the file to use your SSL certificates:

```bash
sudo nano /etc/nginx/sites-available/mailgun-proxy.conf
```

Test and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Set up DNS redirection

Add the following to your `/etc/hosts` file:

```
127.0.0.1 api.eu.mailgun.net api.mailgun.net
```

### 6. Create a systemd service

Copy the provided service file:

```bash
sudo cp ghost-ses-adapter.service /etc/systemd/system/
```

Edit it to use the correct paths:

```bash
sudo nano /etc/systemd/system/ghost-ses-adapter.service
```

Enable and start the service:

```bash
sudo systemctl enable ghost-ses-adapter
sudo systemctl start ghost-ses-adapter
```

### 7. Configure Ghost to use Mailgun

Make sure Ghost is set up to use Mailgun in the admin interface:
- Go to Settings → Email newsletter
- Select Mailgun
- Enter any value for the API key (it's not used but required)
- Enter your domain
- Save settings

## Testing

1. Make sure your adapter is running:
   ```bash
   sudo systemctl status ghost-ses-adapter
   ```

2. Check that the proxy is working:
   ```bash
   curl -k https://api.eu.mailgun.net/health
   ```
   You should see an "OK" response.

3. Try sending a test newsletter from Ghost

4. Check the adapter logs:
   ```bash
   sudo journalctl -u ghost-ses-adapter
   ```

## Troubleshooting

### Common Issues

1. **Ghost still tries to use the real Mailgun API**:
   - Check that your hosts file is correctly configured
   - Make sure you're using the right Mailgun domain in Ghost settings
   - Try restarting Ghost to clear any DNS cache

2. **SES authentication errors**:
   - Verify your AWS credentials are correct
   - Check that your IAM user has SES sending permissions

3. **"Email address is not verified" errors**:
   - Make sure the sender email is verified in SES
   - Or verify your entire sending domain in SES

4. **Adapter starts but doesn't receive requests**:
   - Check your Nginx configuration
   - Verify that port 443 is properly forwarded to the adapter

### Logs

Adjust the `logLevel` in your config.json for more detailed logs:
- `minimal`: Only startup and errors
- `normal`: Request summaries and outcomes (default)
- `verbose`: Full request details including headers and bodies

## How It Works

1. Ghost tries to send newsletters via Mailgun's API endpoints (api.mailgun.net)
2. Your hosts file redirects these requests to your local machine
3. Nginx handles the HTTPS connection and forwards to your adapter
4. The adapter receives the request, extracts the email details
5. The adapter sends the email via AWS SES
6. The adapter returns a success response to Ghost

## Security Considerations

- This adapter doesn't implement authentication since it runs locally
- AWS credentials are stored in the config file, so ensure proper file permissions
- The adapter doesn't validate incoming requests since they should only come from your Ghost instance

## Contributing

Feel free to submit issues or pull requests to improve this adapter.

## License

MIT

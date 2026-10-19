# reCAPTCHA v3 Setup Guide

This application uses Google reCAPTCHA v3 to protect anonymous user registrations from spam and bots.

## Overview

- **When**: CAPTCHA is only executed for anonymous users (users registering without an email)
- **Type**: reCAPTCHA v3 (invisible - no user interaction required)
- **Library**: `react-google-recaptcha-v3`

## Frontend Setup

### 1. Get reCAPTCHA Keys

1. Visit [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin/create)
2. Choose **reCAPTCHA v3**
3. Add your domains:
   - For development: `localhost`
   - For production: your production domain (e.g., `br360.example.com`)
4. You'll receive:
   - **Site Key** (public - for frontend)
   - **Secret Key** (private - for backend)

### 2. Configure Frontend Environment

Create or update `frontend/.env`:

```env
VITE_RECAPTCHA_SITE_KEY=your_site_key_here
```

**Note**: The application will work without this key (using a test key), but you should set your own key for production.

### 3. Frontend Implementation (Already Done)

The following has been implemented:

- ✅ Installed `react-google-recaptcha-v3` package
- ✅ Added `GoogleReCaptchaProvider` to app root ([index.js](frontend/src/index.js))
- ✅ Updated `RegisterForm` to execute CAPTCHA for anonymous users
- ✅ Modified `auth.js` to pass CAPTCHA token to backend

## Backend Setup

### 1. Install Dependencies

```bash
cd backend
npm install axios
```

### 2. Configure Backend Environment

Add to `backend/.env`:

```env
RECAPTCHA_SECRET_KEY=your_secret_key_here
```

### 3. Implement Backend Verification

You need to add CAPTCHA verification to your registration endpoint. Here's the implementation:

#### Create CAPTCHA verification utility

Create `backend/src/utils/recaptcha.js`:

```javascript
const axios = require('axios');

async function verifyRecaptcha(token) {
  if (!token) {
    return { success: false, error: 'No CAPTCHA token provided' };
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    console.warn('RECAPTCHA_SECRET_KEY not configured - skipping verification');
    return { success: true, score: 1.0 }; // Allow in development
  }

  try {
    const response = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify`,
      null,
      {
        params: {
          secret: secretKey,
          response: token
        }
      }
    );

    const { success, score, 'error-codes': errorCodes } = response.data;

    if (!success) {
      return { success: false, error: errorCodes?.join(', ') || 'Verification failed' };
    }

    // reCAPTCHA v3 returns a score (0.0 - 1.0)
    // 1.0 is very likely a good interaction, 0.0 is very likely a bot
    if (score < 0.5) {
      return { success: false, error: 'Low CAPTCHA score', score };
    }

    return { success: true, score };
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return { success: false, error: 'Verification request failed' };
  }
}

module.exports = { verifyRecaptcha };
```

#### Update Registration Route

Modify `backend/src/routes/auth.js` (or wherever your registration endpoint is):

```javascript
const { verifyRecaptcha } = require('../utils/recaptcha');

router.post('/register', async (req, res) => {
  try {
    const { username, password, email, recaptchaToken } = req.body;

    // Verify CAPTCHA for anonymous users (no email)
    if (!email || email.trim() === '') {
      if (!recaptchaToken) {
        return res.status(400).json({ error: 'CAPTCHA verification required for anonymous registration' });
      }

      const verification = await verifyRecaptcha(recaptchaToken);
      if (!verification.success) {
        return res.status(400).json({
          error: 'CAPTCHA verification failed',
          details: verification.error
        });
      }

      console.log(`✅ CAPTCHA verified for anonymous user ${username} (score: ${verification.score})`);
    }

    // Continue with normal registration logic...
    // ... your existing registration code ...

  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});
```

## Testing

### Development Testing

1. **With Email (No CAPTCHA)**:

   ```text
   Username: testuser
   Email: test@example.com
   Password: Test123!@#
   ```

   → Should register without CAPTCHA

2. **Without Email (With CAPTCHA)**:

   ```text
   Username: anonuser
   Email: (leave empty)
   Password: Test123!@#
   ```

   → Should execute CAPTCHA invisibly and register

### Production Testing

1. Set up real reCAPTCHA keys (not test keys)
2. Test from your production domain
3. Monitor CAPTCHA scores in Google reCAPTCHA Admin Console

## CAPTCHA Scores

reCAPTCHA v3 returns a score:

- **1.0**: Very likely a legitimate user
- **0.5**: Threshold (configurable in `recaptcha.js`)
- **0.0**: Very likely a bot

You can adjust the threshold in `backend/src/utils/recaptcha.js` based on your needs.

## Troubleshooting

### Frontend Issues

1. **"executeRecaptcha is undefined"**:
   - Make sure `GoogleReCaptchaProvider` is wrapping your app
   - Check that `VITE_RECAPTCHA_SITE_KEY` is set

2. **CAPTCHA not loading**:
   - Check browser console for errors
   - Verify domain is registered in reCAPTCHA admin
   - Check network tab for reCAPTCHA script loading

### Backend Issues

1. **Verification always failing**:
   - Verify `RECAPTCHA_SECRET_KEY` is correctly set
   - Check that secret key matches site key domain
   - Ensure axios is installed

2. **Low scores**:
   - Adjust threshold in `verifyRecaptcha` function
   - Check Google reCAPTCHA console for details
   - Consider user behavior patterns

## Security Notes

- ✅ CAPTCHA tokens are single-use and expire quickly
- ✅ Only anonymous users (no email) require CAPTCHA
- ✅ Backend validation is required (don't trust frontend only)
- ✅ Secret key must be kept secure (never commit to git)
- ✅ Use environment variables for all keys

## Additional Resources

- [reCAPTCHA v3 Documentation](https://developers.google.com/recaptcha/docs/v3)
- [react-google-recaptcha-v3 npm package](https://www.npmjs.com/package/react-google-recaptcha-v3)
- [reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)

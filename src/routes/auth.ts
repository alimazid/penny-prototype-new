import express from 'express';
import { GmailService } from '../services/gmailService';
import { DatabaseOperations, prisma } from '../utils/database';
import { logger } from '../utils/logger';

const router = express.Router();

// Gmail OAuth flow
router.get('/google', async (req, res) => {
  try {
    const userId = req.query.user_id as string || 'default';
    const gmailService = new GmailService();
    const authUrl = gmailService.generateAuthUrl(userId);
    
    logger.info('Generated OAuth URL for user:', userId);
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Gmail OAuth callback
router.get('/google/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string; // userId
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code not provided' });
    }

    const gmailService = new GmailService();
    const tokens = await gmailService.getTokensFromCode(code);
    
    // Set credentials for this service instance
    gmailService.setCredentials(tokens);
    
    // Get user profile
    const profile = await gmailService.getUserProfile();
    
    // Store user and email account in database
    let user = await DatabaseOperations.findUserByEmail(profile.email);
    if (!user) {
      user = await DatabaseOperations.createUser({
        email: profile.email,
        displayName: profile.email.split('@')[0],
      });
    }
    
    // Store email account with tokens
    await DatabaseOperations.createEmailAccount({
      userId: user.id,
      gmailAddress: profile.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiryDate ? new Date(tokens.expiryDate) : undefined,
    });
    
    logger.info('OAuth flow completed for user:', profile.email);
    
    // Redirect to dashboard with success message
    res.redirect('/dashboard?auth=success');
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.redirect('/dashboard?auth=error');
  }
});

// Check authentication status
router.get('/status', async (req, res) => {
  try {
    // For prototype, we'll just check if we have any connected accounts
    // In production, this would check the user's session
    const accounts = await prisma.emailAccount.findMany({
      where: { isConnected: true },
      include: { user: true },
    });
    
    res.json({
      authenticated: accounts.length > 0,
      accounts: accounts.map(account => ({
        id: account.id,
        email: account.gmailAddress,
        user: account.user.displayName,
        lastSync: account.lastSyncAt,
      })),
    });
  } catch (error) {
    logger.error('Error checking auth status:', error);
    res.status(500).json({ error: 'Failed to check authentication status' });
  }
});

export default router;
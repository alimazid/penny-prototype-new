"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const gmailService_1 = require("../services/gmailService");
const database_1 = require("../utils/database");
const logger_1 = require("../utils/logger");
const router = express_1.default.Router();
// Gmail OAuth flow
router.get('/google', async (req, res) => {
    try {
        const userId = req.query.user_id || 'default';
        const gmailService = new gmailService_1.GmailService();
        const authUrl = gmailService.generateAuthUrl(userId);
        logger_1.logger.info('Generated OAuth URL for user:', userId);
        res.redirect(authUrl);
    }
    catch (error) {
        logger_1.logger.error('Error generating auth URL:', error);
        res.status(500).json({ error: 'Failed to generate auth URL' });
    }
});
// Gmail OAuth callback
router.get('/google/callback', async (req, res) => {
    try {
        const code = req.query.code;
        const _state = req.query.state; // userId
        if (!code) {
            return res.status(400).json({ error: 'Authorization code not provided' });
        }
        const gmailService = new gmailService_1.GmailService();
        const tokens = await gmailService.getTokensFromCode(code);
        // Set credentials for this service instance
        gmailService.setCredentials(tokens);
        // Get user profile
        const profile = await gmailService.getUserProfile();
        // Store user and email account in database
        let user = await database_1.DatabaseOperations.findUserByEmail(profile.email);
        if (!user) {
            user = await database_1.DatabaseOperations.createUser({
                email: profile.email,
                displayName: profile.email.split('@')[0],
            });
        }
        // Store email account with tokens
        await database_1.DatabaseOperations.createEmailAccount({
            userId: user.id,
            gmailAddress: profile.email,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            tokenExpiresAt: tokens.expiryDate ? new Date(tokens.expiryDate) : undefined,
        });
        logger_1.logger.info('OAuth flow completed for user:', profile.email);
        // Redirect to dashboard with success message
        res.redirect('/dashboard?auth=success');
    }
    catch (error) {
        logger_1.logger.error('OAuth callback error:', error);
        res.redirect('/dashboard?auth=error');
    }
});
// Check authentication status
router.get('/status', async (_req, res) => {
    try {
        // For prototype, we'll just check if we have any connected accounts
        // In production, this would check the user's session
        const accounts = await database_1.prisma.emailAccount.findMany({
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
    }
    catch (error) {
        logger_1.logger.error('Error checking auth status:', error);
        res.status(500).json({ error: 'Failed to check authentication status' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map
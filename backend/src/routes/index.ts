import { Router } from 'express';
import authRoutes from './auth';
import dashboardRoutes from './dashboard';
import agentRoutes from './agents';
import llmRoutes from './llm';
import sessionRoutes from './sessions';
import skillRoutes from './skills';
import chainRoutes from './chains';
import channelRoutes from './channels';
import fileRoutes from './files';
import userRoutes from './users';
import settingsRoutes from './settings';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/agents', agentRoutes);
router.use('/llm', llmRoutes);
router.use('/sessions', sessionRoutes);
router.use('/skills', skillRoutes);
router.use('/chains', chainRoutes);
router.use('/channels', channelRoutes);
router.use('/files', fileRoutes);
router.use('/users', userRoutes);
router.use('/settings', settingsRoutes);

export default router;

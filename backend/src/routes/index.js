import { Router } from 'express';
import healthRouter from './health.js';
import authRouter from './auth.js';
import userRouter from './users.js';
import catalogsRouter from './catalogs.js';
import productsRouter from './products.js';
import metricsRouter from './metrics.js';
import creativesRouter from './creatives.js';
import commentsRouter from './comments.js';
import activityRouter from './activity.js';
import notificationsRouter from './notifications.js';
import dashboardRouter from './dashboard.js';
import exportImportRouter from './exportImport.js';
import eventsRouter from './events.js';
import uploadsRouter from './uploads.js';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/', userRouter);
router.use('/', catalogsRouter);
router.use('/', productsRouter);
router.use('/', metricsRouter);
router.use('/', creativesRouter);
router.use('/', commentsRouter);
router.use('/activity', activityRouter);
router.use('/notifications', notificationsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/', exportImportRouter);
router.use('/', eventsRouter);
router.use('/', uploadsRouter);

export default router;

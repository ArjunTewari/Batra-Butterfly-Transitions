import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import accountRouter from "./account";
import retailersRouter from "./retailers";
import analyticsRouter from "./analytics";
import staffRouter from "./staff";
import stockRouter from "./stock";
import dashboardRouter from "./dashboard";
import invoicesRouter from "./invoices";
import suppliersRouter from "./suppliers";
import paymentClearanceRouter from "./payment-clearance";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(accountRouter);
router.use(retailersRouter);
router.use(analyticsRouter);
router.use(staffRouter);
router.use(stockRouter);
router.use(dashboardRouter);
router.use(invoicesRouter);
router.use(suppliersRouter);
router.use(paymentClearanceRouter);

export default router;

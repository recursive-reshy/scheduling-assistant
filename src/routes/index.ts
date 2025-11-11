import { Router } from 'express'
// Routes
import webhook from './webhook.routes.js'

const router = Router()

router.use( '/webhook', webhook )

export default router
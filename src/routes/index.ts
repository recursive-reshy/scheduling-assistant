import { Router } from 'express'
// Routes
import webhook from './webhook.routes.js'

const router = Router()

router.use( '/whatsapp', webhook )

export default router
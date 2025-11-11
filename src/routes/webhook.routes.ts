import { Router } from 'express'
// Controllers
import { handleIncomingMessage } from '../controllers/webhook.controller.js'

const router = Router()

router.post( '/incoming', handleIncomingMessage )

export default router